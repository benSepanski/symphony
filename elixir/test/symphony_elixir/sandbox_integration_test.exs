defmodule SymphonyElixir.SandboxIntegrationTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixir.ClaudeCode.StreamClient

  describe "ClaudeCode StreamClient sbx runtime integration" do
    test "run_turn invokes sbx binary with correct arguments when sandbox is sbx" do
      test_root =
        Path.join(
          System.tmp_dir!(),
          "symphony-sbx-claude-#{System.unique_integer([:positive])}"
        )

      try do
        workspace_root = Path.join(test_root, "workspaces")
        workspace = Path.join(workspace_root, "MT-SBX-1")
        bin_dir = Path.join(test_root, "bin")
        trace_file = Path.join(test_root, "sbx-claude.trace")
        fake_sbx = Path.join(bin_dir, "sbx")

        File.mkdir_p!(workspace)
        File.mkdir_p!(bin_dir)

        # Fake sbx: records all args to trace file, then emits the minimal
        # stream-json sequence that StreamClient.run_turn expects.
        File.write!(fake_sbx, """
        #!/bin/sh
        printf '%s\\n' "$*" >> "#{trace_file}"
        printf '%s\\n' '{"type":"system","subtype":"init","session_id":"sbx-sess"}'
        printf '%s\\n' '{"type":"result","subtype":"success","cost_usd":0.001,"session_id":"sbx-sess","input_tokens":10,"output_tokens":5,"total_tokens":15,"num_turns":1,"duration_ms":100}'
        """)

        File.chmod!(fake_sbx, 0o755)

        original_path = System.get_env("PATH")
        System.put_env("PATH", bin_dir <> ":" <> (original_path || ""))
        on_exit(fn -> restore_env("PATH", original_path) end)

        write_workflow_file!(Workflow.workflow_file_path(),
          workspace_root: workspace_root,
          agent_kind: "claude_code",
          claude_code_command: "claude",
          claude_code_sandbox: "sbx",
          claude_code_permission_mode: "full"
        )

        issue = %Issue{
          id: "issue-sbx-claude",
          identifier: "MT-SBX-1",
          title: "Test sbx integration",
          description: "Verify sbx is invoked at runtime",
          state: "In Progress",
          url: "https://example.org/issues/MT-SBX-1",
          labels: ["backend"]
        }

        {:ok, session} = StreamClient.start_session(workspace)
        assert {:ok, result} = StreamClient.run_turn(session, "test prompt", issue)
        assert result.session_id == "sbx-sess"

        # Verify sbx was actually invoked with correct arguments
        trace = File.read!(trace_file)
        assert trace =~ "run"
        assert trace =~ "--name"
        assert trace =~ "claude"
        assert trace =~ workspace
        assert trace =~ "--"
        assert trace =~ "-p"
        assert trace =~ "test prompt"
        assert trace =~ "--dangerously-skip-permissions"
      after
        File.rm_rf(test_root)
      end
    end
  end

  describe "Codex AppServer sbx runtime integration" do
    test "run invokes sbx binary with correct arguments when sandbox is sbx" do
      test_root =
        Path.join(
          System.tmp_dir!(),
          "symphony-sbx-codex-#{System.unique_integer([:positive])}"
        )

      try do
        workspace_root = Path.join(test_root, "workspaces")
        workspace = Path.join(workspace_root, "MT-SBX-2")
        bin_dir = Path.join(test_root, "bin")
        trace_file = Path.join(test_root, "sbx-codex.trace")
        fake_sbx = Path.join(bin_dir, "sbx")

        File.mkdir_p!(workspace)
        File.mkdir_p!(bin_dir)

        # Fake sbx: records all args to trace file (appending so sbx rm does not
        # overwrite the run trace), then handles the JSON-RPC protocol that
        # AppServer expects (initialize, initialized, thread/start, turn/start,
        # turn/completed).
        File.write!(fake_sbx, """
        #!/bin/sh
        printf '%s\\n' "$*" >> "#{trace_file}"
        [ "$1" = "rm" ] && exit 0
        count=0
        while IFS= read -r line; do
          count=$((count + 1))
          case "$count" in
            1)
              printf '%s\\n' '{"id":1,"result":{}}'
              ;;
            2)
              printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-sbx"}}}'
              ;;
            3)
              printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-sbx"}}}'
              ;;
            4)
              printf '%s\\n' '{"method":"turn/completed"}'
              exit 0
              ;;
            *)
              exit 0
              ;;
          esac
        done
        """)

        File.chmod!(fake_sbx, 0o755)

        original_path = System.get_env("PATH")
        System.put_env("PATH", bin_dir <> ":" <> (original_path || ""))
        on_exit(fn -> restore_env("PATH", original_path) end)

        write_workflow_file!(Workflow.workflow_file_path(),
          workspace_root: workspace_root,
          codex_command: "codex app-server",
          codex_sandbox: "sbx"
        )

        issue = %Issue{
          id: "issue-sbx-codex",
          identifier: "MT-SBX-2",
          title: "Test sbx codex integration",
          description: "Verify sbx wraps codex at runtime",
          state: "In Progress",
          url: "https://example.org/issues/MT-SBX-2",
          labels: ["backend"]
        }

        assert {:ok, _result} = AppServer.run(workspace, "test codex prompt", issue)

        # Verify sbx was actually invoked with correct arguments for the run
        trace = File.read!(trace_file)
        assert trace =~ "run"
        assert trace =~ "--name"
        assert trace =~ "codex"
        assert trace =~ workspace
      after
        File.rm_rf(test_root)
      end
    end
  end
end
