defmodule SymphonyElixir.SandboxCommandTest do
  use ExUnit.Case, async: true

  alias SymphonyElixir.ClaudeCode.StreamClient
  alias SymphonyElixir.Codex.AppServer

  describe "ClaudeCode.StreamClient.build_command/4" do
    test "wraps claude with sbx when sandbox is sbx" do
      settings = %{
        command: "claude",
        sandbox: "sbx",
        permission_mode: "auto",
        model: nil,
        max_turns: nil,
        allowed_tools: []
      }

      cmd = StreamClient.build_command("do stuff", nil, "/work/repo", settings)

      assert ["sbx", "run", "--name", _name, "claude", "/work/repo", "--" | claude_args] = cmd
      assert "-p" in claude_args
      assert "do stuff" in claude_args
      assert "--output-format" in claude_args
      assert "stream-json" in claude_args
    end

    test "does not wrap with sbx when sandbox is nil" do
      settings = %{
        command: "claude",
        sandbox: nil,
        permission_mode: "auto",
        model: nil,
        max_turns: nil,
        allowed_tools: []
      }

      cmd = StreamClient.build_command("do stuff", nil, "/work/repo", settings)

      assert ["claude" | claude_args] = cmd
      assert "-p" in claude_args
      refute "sbx" in cmd
    end

    test "includes --resume when session_id is provided" do
      settings = %{
        command: "claude",
        sandbox: "sbx",
        permission_mode: "auto",
        model: nil,
        max_turns: nil,
        allowed_tools: []
      }

      cmd = StreamClient.build_command("prompt", "sess-123", "/work/repo", settings)

      assert ["sbx", "run", "--name", _name, "claude", "/work/repo", "--" | claude_args] = cmd
      assert "--resume" in claude_args
      assert "sess-123" in claude_args
    end

    test "includes --model when model is set" do
      settings = %{
        command: "claude",
        sandbox: "sbx",
        permission_mode: "auto",
        model: "opus",
        max_turns: nil,
        allowed_tools: []
      }

      cmd = StreamClient.build_command("prompt", nil, "/work/repo", settings)

      assert ["sbx", "run", "--name", _name, "claude", "/work/repo", "--" | claude_args] = cmd
      assert "--model" in claude_args
      assert "opus" in claude_args
    end

    test "includes --dangerously-skip-permissions when permission_mode is full" do
      settings = %{
        command: "claude",
        sandbox: "sbx",
        permission_mode: "full",
        model: nil,
        max_turns: nil,
        allowed_tools: []
      }

      cmd = StreamClient.build_command("prompt", nil, "/work/repo", settings)

      assert "--dangerously-skip-permissions" in cmd
    end

    test "does not include --dangerously-skip-permissions when permission_mode is auto" do
      settings = %{
        command: "claude",
        sandbox: nil,
        permission_mode: "auto",
        model: nil,
        max_turns: nil,
        allowed_tools: []
      }

      cmd = StreamClient.build_command("prompt", nil, "/work/repo", settings)

      refute "--dangerously-skip-permissions" in cmd
    end
  end

  describe "Codex.AppServer.local_launch_command/3" do
    test "wraps command with sbx when sandbox is sbx" do
      result = AppServer.local_launch_command("/work/repo", "sbx", "codex --full-auto")

      assert result == "sbx run --name 'codex-repo' 'codex' '/work/repo' -- --full-auto"
    end

    test "wraps single-word command with sbx" do
      result = AppServer.local_launch_command("/work/repo", "sbx", "codex")

      assert result == "sbx run --name 'codex-repo' 'codex' '/work/repo'"
    end

    test "returns command unchanged when sandbox is nil" do
      result = AppServer.local_launch_command("/work/repo", nil, "codex --full-auto")

      assert result == "codex --full-auto"
    end

    test "returns command unchanged when sandbox is unknown value" do
      result = AppServer.local_launch_command("/work/repo", "other", "codex --full-auto")

      assert result == "codex --full-auto"
    end
  end
end
