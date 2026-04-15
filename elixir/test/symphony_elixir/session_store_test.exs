defmodule SymphonyElixir.SessionStoreTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixir.SessionStore

  setup do
    on_exit(fn -> SessionStore.clear() end)
    :ok
  end

  describe "save/1 and load/0" do
    test "round-trips running entries with session_ids" do
      running = %{
        "issue-1" => %{
          identifier: "PROJ-1",
          session_id: "sess-abc",
          worker_host: nil,
          workspace_path: "/tmp/ws/proj-1"
        },
        "issue-2" => %{
          identifier: "PROJ-2",
          session_id: "sess-def",
          worker_host: "remote-host",
          workspace_path: "/tmp/ws/proj-2"
        }
      }

      assert :ok = SessionStore.save(running)
      loaded = SessionStore.load()

      assert length(loaded) == 2

      by_id = Map.new(loaded, fn s -> {s.issue_id, s} end)

      assert by_id["issue-1"].session_id == "sess-abc"
      assert by_id["issue-1"].identifier == "PROJ-1"
      assert by_id["issue-1"].workspace_path == "/tmp/ws/proj-1"
      assert by_id["issue-1"].worker_host == nil

      assert by_id["issue-2"].session_id == "sess-def"
      assert by_id["issue-2"].worker_host == "remote-host"
    end

    test "skips entries without session_id" do
      running = %{
        "issue-1" => %{
          identifier: "PROJ-1",
          session_id: nil,
          worker_host: nil,
          workspace_path: "/tmp/ws/proj-1"
        },
        "issue-2" => %{
          identifier: "PROJ-2",
          session_id: "sess-def",
          worker_host: nil,
          workspace_path: "/tmp/ws/proj-2"
        }
      }

      assert :ok = SessionStore.save(running)
      loaded = SessionStore.load()

      assert length(loaded) == 1
      assert hd(loaded).issue_id == "issue-2"
    end

    test "skips entries with empty session_id" do
      running = %{
        "issue-1" => %{
          identifier: "PROJ-1",
          session_id: "",
          worker_host: nil,
          workspace_path: nil
        }
      }

      assert :ok = SessionStore.save(running)
      assert SessionStore.load() == []
    end
  end

  describe "clear/0" do
    test "removes the session file" do
      running = %{
        "issue-1" => %{
          identifier: "PROJ-1",
          session_id: "sess-abc",
          worker_host: nil,
          workspace_path: nil
        }
      }

      SessionStore.save(running)
      assert SessionStore.load() != []

      SessionStore.clear()
      assert SessionStore.load() == []
    end

    test "is idempotent when file does not exist" do
      assert :ok = SessionStore.clear()
      assert :ok = SessionStore.clear()
    end
  end

  describe "clear_issue/1" do
    test "removes a single issue and preserves others" do
      running = %{
        "issue-1" => %{
          identifier: "PROJ-1",
          session_id: "sess-abc",
          worker_host: nil,
          workspace_path: nil
        },
        "issue-2" => %{
          identifier: "PROJ-2",
          session_id: "sess-def",
          worker_host: nil,
          workspace_path: nil
        }
      }

      SessionStore.save(running)
      SessionStore.clear_issue("issue-1")

      loaded = SessionStore.load()
      assert length(loaded) == 1
      assert hd(loaded).issue_id == "issue-2"
    end

    test "clears file entirely when last issue is removed" do
      running = %{
        "issue-1" => %{
          identifier: "PROJ-1",
          session_id: "sess-abc",
          worker_host: nil,
          workspace_path: nil
        }
      }

      SessionStore.save(running)
      SessionStore.clear_issue("issue-1")

      assert SessionStore.load() == []
      refute File.exists?(SessionStore.session_file_path())
    end
  end

  describe "load/0 edge cases" do
    test "returns empty list when file does not exist" do
      assert SessionStore.load() == []
    end

    test "returns empty list when file contains invalid JSON" do
      path = SessionStore.session_file_path()
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, "not valid json{{{")

      assert SessionStore.load() == []
    end

    test "returns empty list when file contains non-array JSON" do
      path = SessionStore.session_file_path()
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, ~s({"key": "value"}))

      assert SessionStore.load() == []
    end

    test "skips entries with missing issue_id or session_id" do
      path = SessionStore.session_file_path()
      File.mkdir_p!(Path.dirname(path))

      entries =
        Jason.encode!([
          %{"session_id" => "sess-1"},
          %{"issue_id" => "issue-1"},
          %{"issue_id" => "issue-2", "session_id" => "sess-2"},
          "not a map"
        ])

      File.write!(path, entries)

      loaded = SessionStore.load()
      assert length(loaded) == 1
      assert hd(loaded).issue_id == "issue-2"
    end
  end

  describe "save/1 edge cases" do
    test "saves empty map without error" do
      assert :ok = SessionStore.save(%{})
      assert SessionStore.load() == []
    end

    test "returns error when file is not writable" do
      path = SessionStore.session_file_path()
      File.mkdir_p!(Path.dirname(path))
      # Create a directory where the file should be, making write impossible
      File.rm(path)
      File.mkdir_p!(path)

      running = %{
        "issue-1" => %{
          identifier: "PROJ-1",
          session_id: "sess-abc",
          worker_host: nil,
          workspace_path: nil
        }
      }

      assert {:error, _reason} = SessionStore.save(running)
      File.rmdir(path)
    end
  end

  describe "clear/0 edge cases" do
    test "handles non-removable path gracefully" do
      path = SessionStore.session_file_path()
      dir = Path.dirname(path)
      File.mkdir_p!(dir)

      # Create a directory where the file should be (rm will fail with :eperm)
      File.rm(path)
      File.mkdir_p!(path)

      assert :ok = SessionStore.clear()
      File.rmdir(path)
    end
  end

  describe "load/0 with unreadable file" do
    test "returns empty list when file has permission error" do
      path = SessionStore.session_file_path()
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, "[]")
      File.chmod!(path, 0o000)

      assert SessionStore.load() == []
      File.chmod!(path, 0o644)
    end
  end

  describe "session_file_path/0" do
    test "returns a path inside workspace root" do
      path = SessionStore.session_file_path()
      assert String.ends_with?(path, "symphony_sessions.json")
    end
  end
end
