defmodule SymphonyElixir.SessionStore do
  @moduledoc """
  Persists and recovers agent session metadata across orchestrator restarts.

  Writes a JSON file into the workspace root so that on restart the orchestrator
  can pass prior `session_id` values back to agent backends (enabling `--resume`
  for Claude Code, for example).

  The file is intentionally best-effort: a missing or corrupt file is treated the
  same as an empty session list.
  """

  require Logger

  alias SymphonyElixir.Config

  @session_file "symphony_sessions.json"

  @spec save(map()) :: :ok | {:error, term()}
  def save(running) when is_map(running) do
    entries =
      running
      |> Enum.flat_map(fn {issue_id, entry} ->
        session_id = Map.get(entry, :session_id)

        if is_binary(session_id) and session_id != "" do
          [
            %{
              issue_id: issue_id,
              identifier: Map.get(entry, :identifier),
              session_id: session_id,
              worker_host: Map.get(entry, :worker_host),
              workspace_path: Map.get(entry, :workspace_path)
            }
          ]
        else
          []
        end
      end)

    path = session_file_path()

    case write_json(path, entries) do
      :ok ->
        Logger.info("Persisted #{length(entries)} session(s) to #{path}")
        :ok

      {:error, reason} = err ->
        Logger.warning("Failed to persist sessions to #{path}: #{inspect(reason)}")
        err
    end
  end

  @spec load() :: [map()]
  def load do
    path = session_file_path()

    case read_session_file(path) do
      {:ok, entries} ->
        sessions = Enum.flat_map(entries, &decode_entry/1)
        Logger.info("Loaded #{length(sessions)} persisted session(s) from #{path}")
        sessions

      :empty ->
        []
    end
  end

  defp read_session_file(path) do
    with {:ok, contents} <- File.read(path),
         {:ok, entries} when is_list(entries) <- Jason.decode(contents) do
      {:ok, entries}
    else
      {:error, :enoent} ->
        :empty

      {:error, reason} ->
        Logger.warning("Could not read session file at #{path}: #{inspect(reason)}")
        :empty

      _ ->
        Logger.warning("Corrupt session file at #{path}; ignoring")
        :empty
    end
  end

  @spec clear() :: :ok
  def clear do
    path = session_file_path()

    case File.rm(path) do
      :ok ->
        Logger.info("Cleared persisted session file at #{path}")
        :ok

      {:error, :enoent} ->
        :ok

      {:error, reason} ->
        Logger.warning("Failed to remove session file at #{path}: #{inspect(reason)}")
        :ok
    end
  end

  @spec clear_issue(String.t()) :: :ok
  def clear_issue(issue_id) when is_binary(issue_id) do
    sessions = load()
    remaining = Enum.reject(sessions, fn s -> s.issue_id == issue_id end)

    if remaining == [] do
      clear()
    else
      running =
        Map.new(remaining, fn s ->
          {s.issue_id,
           %{
             identifier: s.identifier,
             session_id: s.session_id,
             worker_host: s.worker_host,
             workspace_path: s.workspace_path
           }}
        end)

      save(running)
    end
  end

  @spec session_file_path() :: String.t()
  def session_file_path do
    Path.join(workspace_root(), @session_file)
  end

  # -------------------------------------------------------------------
  # Private
  # -------------------------------------------------------------------

  defp workspace_root do
    Config.settings!().workspace.root
  end

  defp write_json(path, data) do
    dir = Path.dirname(path)

    with :ok <- File.mkdir_p(dir),
         {:ok, json} <- Jason.encode(data, pretty: true) do
      File.write(path, json)
    end
  end

  defp decode_entry(entry) when is_map(entry) do
    issue_id = entry["issue_id"] || entry[:issue_id]
    session_id = entry["session_id"] || entry[:session_id]

    if is_binary(issue_id) and is_binary(session_id) and session_id != "" do
      [
        %{
          issue_id: issue_id,
          identifier: entry["identifier"] || entry[:identifier],
          session_id: session_id,
          worker_host: entry["worker_host"] || entry[:worker_host],
          workspace_path: entry["workspace_path"] || entry[:workspace_path]
        }
      ]
    else
      []
    end
  end

  defp decode_entry(_entry), do: []
end
