defmodule SymphonyElixir.ClaudeCode.StreamClient do
  @moduledoc """
  Subprocess client for Claude Code CLI using `--output-format stream-json`.
  """

  @behaviour SymphonyElixir.Agent

  require Logger
  alias SymphonyElixir.{Config, PathSafety, SSH}

  @port_line_bytes 1_048_576
  @max_stream_log_bytes 1_000

  @impl true
  @spec start_session(Path.t(), keyword()) :: {:ok, map()} | {:error, term()}
  def start_session(workspace, opts \\ []) do
    worker_host = Keyword.get(opts, :worker_host)

    with {:ok, expanded_workspace} <- validate_workspace(workspace, worker_host) do
      {:ok,
       %{
         workspace: expanded_workspace,
         session_id: nil,
         worker_host: worker_host
       }}
    end
  end

  @impl true
  @spec run_turn(map(), String.t(), map(), keyword()) :: {:ok, map()} | {:error, term()}
  def run_turn(
        %{workspace: workspace, session_id: session_id, worker_host: worker_host} = session,
        prompt,
        issue,
        opts \\ []
      ) do
    on_message = Keyword.get(opts, :on_message, &default_on_message/1)
    settings = Config.claude_code_settings()
    timeout_ms = settings.turn_timeout_ms

    command = build_command(prompt, session_id, settings)

    case start_port(command, workspace, worker_host) do
      {:ok, port} ->
        metadata = port_metadata(port, worker_host)

        case receive_loop(port, on_message, metadata, timeout_ms, "", nil) do
          {:ok, result} ->
            result_session_id = result[:session_id] || session_id
            turn_session_id = result_session_id || "claude-#{:erlang.unique_integer([:positive])}"

            Logger.info(
              "Claude Code session completed for #{issue_context(issue)} session_id=#{turn_session_id}"
            )

            {:ok,
             %{
               result: :turn_completed,
               session_id: turn_session_id,
               session: %{session | session_id: result_session_id},
               cost_usd: result[:cost_usd],
               usage: result[:usage]
             }}

          {:error, reason} ->
            Logger.warning(
              "Claude Code session ended with error for #{issue_context(issue)}: #{inspect(reason)}"
            )

            emit_message(on_message, :turn_ended_with_error, %{reason: reason}, metadata)
            {:error, reason}
        end

      {:error, reason} ->
        Logger.error("Failed to start Claude Code for #{issue_context(issue)}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @impl true
  @spec stop_session(map()) :: :ok
  def stop_session(_session), do: :ok

  # -- Command building --

  defp build_command(prompt, session_id, settings) do
    base = [settings.command, "-p", prompt, "--output-format", "stream-json", "--verbose"]

    base
    |> maybe_add_flag("--resume", session_id)
    |> maybe_add_flag("--model", settings.model)
    |> maybe_add_flag("--max-turns", int_to_string(settings.max_turns))
    |> maybe_add_allowed_tools(settings.allowed_tools)
  end

  defp maybe_add_flag(args, _flag, nil), do: args
  defp maybe_add_flag(args, _flag, ""), do: args
  defp maybe_add_flag(args, flag, value), do: args ++ [flag, to_string(value)]

  defp maybe_add_allowed_tools(args, []), do: args

  defp maybe_add_allowed_tools(args, tools) when is_list(tools) do
    args ++ Enum.flat_map(tools, fn tool -> ["--allowedTools", tool] end)
  end

  defp int_to_string(nil), do: nil
  defp int_to_string(value) when is_integer(value), do: Integer.to_string(value)
  defp int_to_string(value), do: to_string(value)

  # -- Port management --

  defp start_port(command_parts, workspace, nil) do
    executable = System.find_executable("bash")

    if is_nil(executable) do
      {:error, :bash_not_found}
    else
      shell_command = Enum.map_join(command_parts, " ", &shell_escape/1)

      port =
        Port.open(
          {:spawn_executable, String.to_charlist(executable)},
          [
            :binary,
            :exit_status,
            :stderr_to_stdout,
            args: [~c"-lc", String.to_charlist(shell_command)],
            cd: String.to_charlist(workspace),
            line: @port_line_bytes
          ]
        )

      {:ok, port}
    end
  end

  defp start_port(command_parts, workspace, worker_host) when is_binary(worker_host) do
    shell_command = Enum.map_join(command_parts, " ", &shell_escape/1)
    remote_command = "cd #{shell_escape(workspace)} && #{shell_command}"
    SSH.start_port(worker_host, remote_command, line: @port_line_bytes)
  end

  # -- Stream receive loop --

  defp receive_loop(port, on_message, metadata, timeout_ms, pending_line, accumulated_result) do
    receive do
      {^port, {:data, {:eol, chunk}}} ->
        complete_line = pending_line <> to_string(chunk)

        case handle_stream_line(port, on_message, metadata, complete_line, accumulated_result) do
          {:continue, updated_result} ->
            receive_loop(port, on_message, metadata, timeout_ms, "", updated_result)

          {:done, result} ->
            wait_for_port_exit(port)
            {:ok, result}

          {:error, reason} ->
            wait_for_port_exit(port)
            {:error, reason}
        end

      {^port, {:data, {:noeol, chunk}}} ->
        receive_loop(
          port,
          on_message,
          metadata,
          timeout_ms,
          pending_line <> to_string(chunk),
          accumulated_result
        )

      {^port, {:exit_status, 0}} ->
        {:ok, accumulated_result || %{}}

      {^port, {:exit_status, status}} ->
        {:error, {:port_exit, status}}
    after
      timeout_ms ->
        stop_port(port)
        {:error, :turn_timeout}
    end
  end

  defp handle_stream_line(port, on_message, metadata, data, accumulated_result) do
    case Jason.decode(data) do
      {:ok, %{"type" => "system", "subtype" => "init"} = payload} ->
        session_id = Map.get(payload, "session_id")

        emit_message(
          on_message,
          :session_started,
          %{session_id: session_id, thread_id: session_id, turn_id: "1"},
          metadata
        )

        {:continue, Map.merge(accumulated_result || %{}, %{session_id: session_id})}

      {:ok, %{"type" => "assistant", "message" => message} = payload} ->
        usage = extract_usage_from_message(message)
        metadata_with_usage = if usage, do: Map.put(metadata, :usage, usage), else: metadata

        emit_message(
          on_message,
          :notification,
          %{payload: payload, raw: data},
          metadata_with_usage
        )

        {:continue, maybe_update_usage(accumulated_result, usage)}

      {:ok, %{"type" => "result", "subtype" => "success"} = payload} ->
        usage = %{
          "input_tokens" => Map.get(payload, "input_tokens"),
          "output_tokens" => Map.get(payload, "output_tokens"),
          "total_tokens" => Map.get(payload, "total_tokens")
        }

        cost_usd = Map.get(payload, "cost_usd")
        result_session_id = Map.get(payload, "session_id")

        result = %{
          session_id: result_session_id || (accumulated_result && accumulated_result[:session_id]),
          cost_usd: cost_usd,
          usage: usage,
          num_turns: Map.get(payload, "num_turns"),
          duration_ms: Map.get(payload, "duration_ms")
        }

        emit_message(
          on_message,
          :turn_completed,
          %{payload: payload, raw: data, details: payload, cost_usd: cost_usd},
          Map.put(metadata, :usage, usage)
        )

        {:done, result}

      {:ok, %{"type" => "result", "subtype" => "error"} = payload} ->
        emit_message(
          on_message,
          :turn_failed,
          %{payload: payload, raw: data, details: payload},
          metadata
        )

        {:error, {:turn_failed, payload}}

      {:ok, %{"type" => type} = payload} when type in ["tool_use", "tool_result"] ->
        emit_message(
          on_message,
          :notification,
          %{payload: payload, raw: data},
          metadata
        )

        {:continue, accumulated_result}

      {:ok, payload} ->
        emit_message(
          on_message,
          :other_message,
          %{payload: payload, raw: data},
          metadata
        )

        {:continue, accumulated_result}

      {:error, _reason} ->
        log_non_json_line(data)
        {:continue, accumulated_result}
    end
  end

  # -- Usage extraction --

  defp extract_usage_from_message(%{"usage" => usage}) when is_map(usage), do: usage
  defp extract_usage_from_message(_message), do: nil

  defp maybe_update_usage(nil, usage), do: %{usage: usage}
  defp maybe_update_usage(result, nil), do: result
  defp maybe_update_usage(result, usage), do: Map.put(result, :usage, usage)

  # -- Helpers --

  defp validate_workspace(workspace, nil) when is_binary(workspace) do
    expanded_workspace = Path.expand(workspace)
    expanded_root = Path.expand(Config.settings!().workspace.root)
    expanded_root_prefix = expanded_root <> "/"

    with {:ok, canonical_workspace} <- PathSafety.canonicalize(expanded_workspace),
         {:ok, canonical_root} <- PathSafety.canonicalize(expanded_root) do
      canonical_root_prefix = canonical_root <> "/"

      cond do
        canonical_workspace == canonical_root ->
          {:error, {:invalid_workspace_cwd, :workspace_root, canonical_workspace}}

        String.starts_with?(canonical_workspace <> "/", canonical_root_prefix) ->
          {:ok, canonical_workspace}

        String.starts_with?(expanded_workspace <> "/", expanded_root_prefix) ->
          {:error, {:invalid_workspace_cwd, :symlink_escape, expanded_workspace, canonical_root}}

        true ->
          {:error, {:invalid_workspace_cwd, :outside_workspace_root, canonical_workspace, canonical_root}}
      end
    else
      {:error, {:path_canonicalize_failed, path, reason}} ->
        {:error, {:invalid_workspace_cwd, :path_unreadable, path, reason}}
    end
  end

  defp validate_workspace(workspace, worker_host)
       when is_binary(workspace) and is_binary(worker_host) do
    cond do
      String.trim(workspace) == "" ->
        {:error, {:invalid_workspace_cwd, :empty_remote_workspace, worker_host}}

      String.contains?(workspace, ["\n", "\r", <<0>>]) ->
        {:error, {:invalid_workspace_cwd, :invalid_remote_workspace, worker_host, workspace}}

      true ->
        {:ok, workspace}
    end
  end

  defp port_metadata(port, worker_host) when is_port(port) do
    base =
      case :erlang.port_info(port, :os_pid) do
        {:os_pid, os_pid} -> %{codex_app_server_pid: to_string(os_pid)}
        _ -> %{}
      end

    case worker_host do
      host when is_binary(host) -> Map.put(base, :worker_host, host)
      _ -> base
    end
  end

  defp wait_for_port_exit(port) do
    receive do
      {^port, {:exit_status, _status}} -> :ok
    after
      5_000 ->
        stop_port(port)
        :ok
    end
  end

  defp stop_port(port) when is_port(port) do
    case :erlang.port_info(port) do
      :undefined ->
        :ok

      _ ->
        try do
          Port.close(port)
          :ok
        rescue
          ArgumentError -> :ok
        end
    end
  end

  defp emit_message(on_message, event, details, metadata) when is_function(on_message, 1) do
    message =
      metadata
      |> Map.merge(details)
      |> Map.put(:event, event)
      |> Map.put(:timestamp, DateTime.utc_now())

    on_message.(message)
  end

  defp log_non_json_line(data) do
    text =
      data
      |> to_string()
      |> String.trim()
      |> String.slice(0, @max_stream_log_bytes)

    if text != "" do
      if String.match?(text, ~r/\b(error|warn|warning|failed|fatal|panic|exception)\b/i) do
        Logger.warning("Claude Code stream output: #{text}")
      else
        Logger.debug("Claude Code stream output: #{text}")
      end
    end
  end

  defp issue_context(%{id: issue_id, identifier: identifier}) do
    "issue_id=#{issue_id} issue_identifier=#{identifier}"
  end

  defp shell_escape(value) when is_binary(value) do
    "'" <> String.replace(value, "'", "'\"'\"'") <> "'"
  end

  defp default_on_message(_message), do: :ok
end
