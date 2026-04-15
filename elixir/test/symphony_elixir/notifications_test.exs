defmodule SymphonyElixir.NotificationsTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixir.Linear.Issue
  alias SymphonyElixir.Notifications

  defmodule WebhookPlug do
    @moduledoc false
    import Plug.Conn

    def init(opts), do: opts

    def call(conn, _opts) do
      {:ok, body, conn} = Plug.Conn.read_body(conn)
      decoded = Jason.decode!(body)

      case :persistent_term.get({__MODULE__, :test_pid}, nil) do
        pid when is_pid(pid) -> send(pid, {:webhook_received, decoded})
        _ -> :ok
      end

      send_resp(conn, 200, "ok")
    end
  end

  defmodule ErrorPlug do
    @moduledoc false
    import Plug.Conn

    def init(opts), do: opts

    def call(conn, _opts) do
      send_resp(conn, 500, "internal error")
    end
  end

  setup do
    :persistent_term.put({WebhookPlug, :test_pid}, self())
    on_exit(fn -> :persistent_term.erase({WebhookPlug, :test_pid}) end)
    :ok
  end

  defp start_webhook_server(plug \\ WebhookPlug) do
    port = Enum.random(30_000..40_000)

    {:ok, pid} =
      Bandit.start_link(
        plug: plug,
        port: port,
        ip: {127, 0, 0, 1},
        startup_log: false
      )

    on_exit({:stop_bandit, port}, fn ->
      try do
        Supervisor.stop(pid, :normal)
      catch
        :exit, _ -> :ok
      end
    end)

    {"http://127.0.0.1:#{port}/webhook", pid}
  end

  test "notify_rate_limit delivers webhook when configured" do
    {url, _pid} = start_webhook_server()

    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: url,
      notifications_events: ["rate_limit", "human_review"]
    )

    rate_limits = %{"limit_id" => "org-limit", "remaining" => 5}
    assert :ok = Notifications.notify_rate_limit(rate_limits)

    assert_receive {:webhook_received, payload}, 2_000
    assert payload["event"] == "rate_limit"
    assert payload["rate_limits"] == %{"limit_id" => "org-limit", "remaining" => 5}
    assert is_binary(payload["timestamp"])
  end

  test "notify_human_review delivers webhook when configured" do
    {url, _pid} = start_webhook_server()

    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: url,
      notifications_events: ["rate_limit", "human_review"]
    )

    issue = %Issue{
      id: "issue-hr-1",
      identifier: "MT-42",
      title: "Test issue",
      description: "desc",
      state: "Human Review",
      url: "https://example.com/MT-42"
    }

    assert :ok = Notifications.notify_human_review(issue)

    assert_receive {:webhook_received, payload}, 2_000
    assert payload["event"] == "human_review"
    assert payload["issue_id"] == "issue-hr-1"
    assert payload["issue_identifier"] == "MT-42"
    assert payload["issue_title"] == "Test issue"
    assert payload["issue_state"] == "Human Review"
    assert payload["issue_url"] == "https://example.com/MT-42"
    assert is_binary(payload["timestamp"])
  end

  test "no-ops when webhook_url is not configured" do
    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: nil,
      notifications_events: ["rate_limit", "human_review"]
    )

    assert :ok = Notifications.notify_rate_limit(%{"limit_id" => "x"})

    refute_receive {:webhook_received, _}, 100
  end

  test "no-ops when event is not in enabled events list" do
    {url, _pid} = start_webhook_server()

    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: url,
      notifications_events: ["human_review"]
    )

    assert :ok = Notifications.notify_rate_limit(%{"limit_id" => "x"})

    refute_receive {:webhook_received, _}, 200
  end

  test "no-ops when webhook_url is empty string" do
    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: "",
      notifications_events: ["rate_limit"]
    )

    assert :ok = Notifications.notify_rate_limit(%{"limit_id" => "x"})

    refute_receive {:webhook_received, _}, 100
  end

  test "logs warning on non-2xx response" do
    {url, _pid} = start_webhook_server(ErrorPlug)

    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: url,
      notifications_events: ["rate_limit"]
    )

    log =
      capture_log(fn ->
        Notifications.notify_rate_limit(%{"limit_id" => "x"})
        Process.sleep(500)
      end)

    assert log =~ "Notification failed" or log =~ "Notification error"
  end

  test "logs warning on connection error" do
    # Use a port where nothing is listening
    url = "http://127.0.0.1:1/webhook"

    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: url,
      notifications_events: ["rate_limit"]
    )

    log =
      capture_log(fn ->
        Notifications.notify_rate_limit(%{"limit_id" => "x"})
        Process.sleep(500)
      end)

    assert log =~ "Notification error" or log =~ "Notification exception"
  end

  test "orchestrator dispatches rate_limit notification on first detection only" do
    {url, _pid} = start_webhook_server()

    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: url,
      notifications_events: ["rate_limit"]
    )

    orchestrator_name = Module.concat(__MODULE__, :RateLimitOrchestrator)
    {:ok, pid} = Orchestrator.start_link(name: orchestrator_name)

    on_exit(fn ->
      if Process.alive?(pid), do: Process.exit(pid, :normal)
    end)

    issue_id = "issue-rl-1"

    issue = %Issue{
      id: issue_id,
      identifier: "MT-99",
      title: "Rate limit test",
      description: "desc",
      state: "In Progress",
      url: "https://example.com/MT-99"
    }

    initial_state = :sys.get_state(pid)

    running_entry = %{
      pid: self(),
      ref: make_ref(),
      identifier: issue.identifier,
      issue: issue,
      session_id: "session-1",
      turn_count: 0,
      last_codex_message: nil,
      last_codex_timestamp: nil,
      last_codex_event: nil,
      started_at: DateTime.utc_now()
    }

    state_with_issue =
      initial_state
      |> Map.put(:running, %{issue_id => running_entry})
      |> Map.put(:claimed, MapSet.put(initial_state.claimed, issue_id))

    :sys.replace_state(pid, fn _ -> state_with_issue end)

    now = DateTime.utc_now()

    rate_limit_data = %{
      "limit_id" => "org-rate-limit",
      "primary" => %{"remaining" => 5, "limit" => 100, "reset_at" => "2026-01-01T00:00:00Z"}
    }

    send(
      pid,
      {:codex_worker_update, issue_id,
       %{
         event: :notification,
         timestamp: now,
         rate_limits: rate_limit_data
       }}
    )

    assert_receive {:webhook_received, payload}, 2_000
    assert payload["event"] == "rate_limit"
    assert payload["rate_limits"]["limit_id"] == "org-rate-limit"

    # Second rate limit update should NOT trigger another notification
    send(
      pid,
      {:codex_worker_update, issue_id,
       %{
         event: :notification,
         timestamp: DateTime.utc_now(),
         rate_limits: rate_limit_data
       }}
    )

    refute_receive {:webhook_received, _}, 500
  end

  test "orchestrator dispatches human_review notification on non-active state transition" do
    Process.flag(:trap_exit, true)

    {url, _pid} = start_webhook_server()

    write_workflow_file!(Workflow.workflow_file_path(),
      notifications_webhook_url: url,
      notifications_events: ["human_review"],
      tracker_kind: "memory"
    )

    issue_id = "issue-hr-orch"

    issue = %Issue{
      id: issue_id,
      identifier: "MT-55",
      title: "Human review test",
      description: "desc",
      state: "In Progress",
      url: "https://example.com/MT-55"
    }

    # Set up memory tracker with the issue now in "Human Review" state
    Application.put_env(:symphony_elixir, :memory_tracker_issues, [
      %{issue | state: "Human Review"}
    ])

    orchestrator_name = Module.concat(__MODULE__, :HumanReviewOrchestrator)
    {:ok, orch_pid} = Orchestrator.start_link(name: orchestrator_name)

    on_exit(fn ->
      if Process.alive?(orch_pid), do: Process.exit(orch_pid, :normal)
    end)

    # Wait for orchestrator to be ready and pause auto-polling
    Process.sleep(50)
    initial_state = :sys.get_state(orch_pid)

    # Cancel any pending tick so we control the poll cycle
    if is_reference(initial_state.tick_timer_ref) do
      Process.cancel_timer(initial_state.tick_timer_ref)
    end

    running_entry = %{
      pid: self(),
      ref: make_ref(),
      identifier: issue.identifier,
      issue: issue,
      session_id: "session-hr",
      turn_count: 0,
      last_codex_message: nil,
      last_codex_timestamp: nil,
      last_codex_event: nil,
      started_at: DateTime.utc_now()
    }

    :sys.replace_state(orch_pid, fn state ->
      %{state | running: %{issue_id => running_entry}, claimed: MapSet.put(state.claimed, issue_id), tick_timer_ref: nil, tick_token: nil}
    end)

    # Trigger a poll cycle which will reconcile the issue state
    send(orch_pid, :run_poll_cycle)

    assert_receive {:webhook_received, payload}, 3_000
    assert payload["event"] == "human_review"
    assert payload["issue_identifier"] == "MT-55"
  end
end
