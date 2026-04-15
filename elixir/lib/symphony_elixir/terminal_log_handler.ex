defmodule SymphonyElixir.TerminalLogHandler do
  @moduledoc """
  Custom OTP logger handler that routes log events into the StatusDashboard
  ring buffer so they appear in the terminal TUI below the status box.

  Falls back to writing directly to stdout when the StatusDashboard process
  is not running (e.g., during startup, shutdown, or when the TUI is disabled).
  """

  alias SymphonyElixir.StatusDashboard

  @handler_id :symphony_terminal_log

  @spec install() :: :ok
  def install do
    _ = :logger.remove_handler(@handler_id)

    case :logger.add_handler(@handler_id, __MODULE__, %{level: :all}) do
      :ok -> :ok
      {:error, reason} -> IO.puts(:stderr, "Failed to install terminal log handler: #{inspect(reason)}")
    end

    :ok
  end

  # OTP :logger handler callback
  @spec log(:logger.log_event(), :logger.handler_config()) :: term()
  def log(log_event, _config) do
    text = format_log_event(log_event)

    case GenServer.whereis(StatusDashboard) do
      pid when is_pid(pid) ->
        send(pid, {:log_line, log_event.level, text})

      nil ->
        IO.puts(text)
    end
  end

  # OTP :logger handler callbacks (required stubs)
  @spec adding_handler(:logger.handler_config()) :: {:ok, :logger.handler_config()}
  def adding_handler(config), do: {:ok, config}

  @spec removing_handler(:logger.handler_config()) :: :ok
  def removing_handler(_config), do: :ok

  defp format_log_event(log_event) do
    time = format_time(Map.get(log_event.meta, :time, 0))
    level = format_level(log_event.level)
    msg = format_msg(log_event.msg)
    "#{time} #{level} #{msg}"
  end

  defp format_time(time_us) when is_integer(time_us) and time_us > 0 do
    seconds = div(time_us, 1_000_000)

    case DateTime.from_unix(seconds) do
      {:ok, dt} -> Calendar.strftime(dt, "%H:%M:%S")
      _ -> "??:??:??"
    end
  end

  defp format_time(_), do: "??:??:??"

  defp format_level(:debug), do: "[debug]"
  defp format_level(:info), do: "[info] "
  defp format_level(:notice), do: "[note] "
  defp format_level(:warning), do: "[warn] "
  defp format_level(:error), do: "[error]"
  defp format_level(:critical), do: "[crit] "
  defp format_level(:alert), do: "[alert]"
  defp format_level(:emergency), do: "[emerg]"
  defp format_level(level), do: "[#{level}]"

  defp format_msg({:string, iodata}), do: IO.iodata_to_binary(iodata)
  defp format_msg({:report, map}), do: inspect(map, limit: 10)

  defp format_msg({format, args}) when is_list(format) or is_binary(format) do
    :io_lib.format(format, args) |> IO.iodata_to_binary()
  rescue
    _ -> inspect({format, args})
  end

  defp format_msg(other), do: inspect(other)
end
