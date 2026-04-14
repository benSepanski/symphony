defmodule SymphonyElixir.Agent do
  @moduledoc """
  Adapter boundary for coding-agent backends.
  """

  alias SymphonyElixir.Config

  @type session :: map()

  @callback start_session(Path.t(), keyword()) :: {:ok, session()} | {:error, term()}
  @callback run_turn(session(), String.t(), map(), keyword()) :: {:ok, map()} | {:error, term()}
  @callback stop_session(session()) :: :ok

  @spec start_session(Path.t(), keyword()) :: {:ok, session()} | {:error, term()}
  def start_session(workspace, opts \\ []) do
    adapter().start_session(workspace, opts)
  end

  @spec run_turn(session(), String.t(), map(), keyword()) :: {:ok, map()} | {:error, term()}
  def run_turn(session, prompt, issue, opts \\ []) do
    adapter().run_turn(session, prompt, issue, opts)
  end

  @spec stop_session(session()) :: :ok
  def stop_session(session) do
    adapter().stop_session(session)
  end

  @spec adapter() :: module()
  def adapter do
    case Config.settings!().agent.kind do
      "claude_code" -> SymphonyElixir.ClaudeCode.StreamClient
      _ -> SymphonyElixir.Codex.AppServer
    end
  end
end
