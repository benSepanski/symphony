defmodule SymphonyElixirWeb.PresenterTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixirWeb.Presenter

  defp start_orchestrator(test_name) do
    orchestrator_name = Module.concat(__MODULE__, test_name)
    {:ok, pid} = Orchestrator.start_link(name: orchestrator_name)

    on_exit(fn ->
      if Process.alive?(pid), do: Process.exit(pid, :normal)
    end)

    {orchestrator_name, pid}
  end

  defp inject_running(pid, issue_id, overrides \\ %{}) do
    issue = %Issue{
      id: issue_id,
      identifier: "MT-#{System.unique_integer([:positive])}",
      title: "Test issue",
      description: "desc",
      state: "In Progress",
      url: "https://example.org/issues/#{issue_id}"
    }

    running_entry =
      Map.merge(
        %{
          pid: self(),
          ref: make_ref(),
          identifier: issue.identifier,
          issue: issue,
          issue_id: issue_id,
          session_id: "session-abc",
          turn_count: 3,
          last_codex_message: nil,
          last_codex_timestamp: DateTime.utc_now(),
          last_codex_event: :notification,
          started_at: DateTime.utc_now(),
          codex_input_tokens: 100,
          codex_output_tokens: 50,
          codex_total_tokens: 150,
          codex_input_cost_usd: 0.001,
          codex_output_cost_usd: 0.002,
          codex_total_cost_usd: 0.003,
          codex_last_reported_input_tokens: 100,
          codex_last_reported_output_tokens: 50,
          codex_last_reported_total_tokens: 150,
          codex_app_server_pid: nil,
          worker_host: "devbox-01",
          workspace_path: "/tmp/workspaces/#{issue_id}",
          recent_events: []
        },
        overrides
      )

    :sys.replace_state(pid, fn state ->
      state
      |> Map.put(:running, Map.put(state.running, issue_id, running_entry))
      |> Map.put(:claimed, MapSet.put(state.claimed, issue_id))
    end)

    running_entry
  end

  defp inject_retry(pid, issue_id, overrides \\ %{}) do
    retry_entry =
      Map.merge(
        %{
          attempt: 2,
          due_at_ms: System.monotonic_time(:millisecond) + 30_000,
          identifier: "MT-#{System.unique_integer([:positive])}",
          issue_id: issue_id,
          error: "process exited",
          worker_host: "devbox-02",
          workspace_path: "/tmp/workspaces/#{issue_id}"
        },
        overrides
      )

    token = make_ref()

    :sys.replace_state(pid, fn state ->
      state
      |> Map.put(
        :retry_attempts,
        Map.put(state.retry_attempts, issue_id, Map.put(retry_entry, :retry_token, token))
      )
      |> Map.put(:claimed, MapSet.put(state.claimed, issue_id))
    end)

    retry_entry
  end

  # ── state_payload/2 ──

  test "state_payload returns running entries with tokens and cost" do
    {name, pid} = start_orchestrator(:StatePayloadTokens)
    inject_running(pid, "issue-1")

    payload = Presenter.state_payload(name, 5_000)

    assert payload.counts == %{running: 1, retrying: 0}
    assert [entry] = payload.running
    assert entry.tokens == %{input_tokens: 100, output_tokens: 50, total_tokens: 150}
    assert entry.cost == %{input_cost_usd: 0.001, output_cost_usd: 0.002, total_cost_usd: 0.003}
    assert entry.issue_identifier
    assert entry.session_id == "session-abc"
    assert entry.turn_count == 3
    assert entry.worker_host == "devbox-01"
  end

  test "state_payload returns retrying entries" do
    {name, pid} = start_orchestrator(:StatePayloadRetry)
    inject_retry(pid, "issue-retry")

    payload = Presenter.state_payload(name, 5_000)

    assert payload.counts == %{running: 0, retrying: 1}
    assert [retry] = payload.retrying
    assert retry.issue_identifier
    assert retry.attempt == 2
    assert retry.error == "process exited"
    assert retry.worker_host == "devbox-02"
  end

  test "state_payload includes codex_totals with cost defaults" do
    {name, pid} = start_orchestrator(:StatePayloadTotals)

    # Directly set codex_totals to simulate accumulated token usage
    :sys.replace_state(pid, fn state ->
      Map.put(state, :codex_totals, %{
        input_tokens: 200,
        output_tokens: 80,
        total_tokens: 280,
        seconds_running: 60
      })
    end)

    payload = Presenter.state_payload(name, 5_000)

    assert is_map(payload.codex_totals)
    assert payload.codex_totals.input_tokens == 200
    assert payload.codex_totals.output_tokens == 80
    assert payload.codex_totals.total_tokens == 280
    # Cost defaults are injected by Presenter
    assert is_float(payload.codex_totals.input_cost_usd)
    assert is_float(payload.codex_totals.output_cost_usd)
    assert is_float(payload.codex_totals.total_cost_usd)
  end

  test "state_payload includes rate_limits from snapshot" do
    {name, pid} = start_orchestrator(:StatePayloadRateLimits)

    inject_running(pid, "issue-rl", %{
      codex_input_tokens: 0,
      codex_output_tokens: 0,
      codex_total_tokens: 0,
      codex_last_reported_input_tokens: 0,
      codex_last_reported_output_tokens: 0,
      codex_last_reported_total_tokens: 0
    })

    send(
      pid,
      {:codex_worker_update, "issue-rl",
       %{
         event: :rate_limits,
         rate_limits: %{
           "primary" => %{"remaining" => 900, "limit" => 1000, "reset_in_seconds" => 60}
         },
         timestamp: DateTime.utc_now()
       }}
    )

    _ = :sys.get_state(pid)

    payload = Presenter.state_payload(name, 5_000)
    assert is_map(payload.rate_limits) or is_nil(payload.rate_limits)
  end

  test "state_payload returns timeout error when orchestrator is unresponsive" do
    server_name = Module.concat(__MODULE__, :UnresponsivePresenter)
    parent = self()

    pid =
      spawn(fn ->
        Process.register(self(), server_name)
        send(parent, :ready)
        receive do: (:stop -> :ok)
      end)

    assert_receive :ready, 1_000

    payload = Presenter.state_payload(server_name, 10)

    assert payload.error.code == "snapshot_timeout"
    send(pid, :stop)
  end

  test "state_payload returns unavailable error when orchestrator is not running" do
    payload = Presenter.state_payload(:nonexistent_orchestrator, 5_000)
    assert payload.error.code == "snapshot_unavailable"
  end

  # ── issue_payload/3 ──

  test "issue_payload returns running issue with tokens, cost, and resume" do
    {name, pid} = start_orchestrator(:IssuePayloadRunning)
    entry = inject_running(pid, "issue-detail")

    assert {:ok, payload} = Presenter.issue_payload(entry.identifier, name, 5_000)

    assert payload.issue_identifier == entry.identifier
    assert payload.status == "running"

    assert payload.running.tokens == %{input_tokens: 100, output_tokens: 50, total_tokens: 150}

    assert payload.running.cost == %{
             input_cost_usd: 0.001,
             output_cost_usd: 0.002,
             total_cost_usd: 0.003
           }

    assert payload.running.session_id == "session-abc"
    assert payload.running.turn_count == 3
    assert payload.running.state == "In Progress"

    assert payload.workspace.path == "/tmp/workspaces/issue-detail"
    assert payload.workspace.host == "devbox-01"

    assert payload.resume.session_id == "session-abc"
    assert is_binary(payload.resume.command)
  end

  test "issue_payload returns retrying issue" do
    {name, pid} = start_orchestrator(:IssuePayloadRetrying)
    retry = inject_retry(pid, "issue-retry-detail")

    assert {:ok, payload} = Presenter.issue_payload(retry.identifier, name, 5_000)

    assert payload.status == "retrying"
    assert payload.retry.attempt == 2
    assert payload.retry.error == "process exited"
    assert is_nil(payload.running)
  end

  test "issue_payload returns both running and retry data when both exist" do
    {name, pid} = start_orchestrator(:IssuePayloadBoth)
    identifier = "MT-#{System.unique_integer([:positive])}"
    inject_running(pid, "issue-both", %{identifier: identifier})
    inject_retry(pid, "issue-both", %{identifier: identifier})

    assert {:ok, payload} = Presenter.issue_payload(identifier, name, 5_000)

    assert payload.status == "running"
    assert payload.running != nil
    assert payload.retry != nil
  end

  test "issue_payload returns error for unknown issue" do
    {name, _pid} = start_orchestrator(:IssuePayloadNotFound)

    assert {:error, :issue_not_found} = Presenter.issue_payload("MT-MISSING", name, 5_000)
  end

  # ── refresh_payload/1 ──

  test "refresh_payload returns queued response" do
    {name, _pid} = start_orchestrator(:RefreshPayload)

    assert {:ok, payload} = Presenter.refresh_payload(name)

    assert payload.queued == true
    assert is_binary(payload.requested_at)
    assert "poll" in payload.operations
  end

  test "refresh_payload returns unavailable when orchestrator is not running" do
    assert {:error, :unavailable} = Presenter.refresh_payload(:nonexistent_refresh)
  end

  # ── running_entry_payload details ──

  test "state_payload running entry includes recent_events" do
    now = DateTime.utc_now()

    events = [
      %{at: now, event: :notification, message: "doing stuff"},
      %{at: now, event: :tool_call, message: "running tool"}
    ]

    {name, pid} = start_orchestrator(:RecentEvents)
    inject_running(pid, "issue-events", %{recent_events: events})

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert length(entry.recent_events) == 2
    assert Enum.all?(entry.recent_events, &is_binary(&1.at))
  end

  test "state_payload running entry includes resume command with ssh" do
    {name, pid} = start_orchestrator(:ResumeCmd)

    inject_running(pid, "issue-resume", %{
      session_id: "sess-123",
      worker_host: "remote-host",
      workspace_path: "/work/issue-resume"
    })

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert entry.resume.session_id == "sess-123"
    assert entry.resume.command =~ "ssh remote-host"
    assert entry.resume.command =~ "claude --resume sess-123"
  end

  test "state_payload running entry defaults cost to zero when missing" do
    {name, pid} = start_orchestrator(:CostDefaults)

    :sys.replace_state(pid, fn state ->
      issue = %Issue{
        id: "issue-no-cost",
        identifier: "MT-NC",
        title: "No cost",
        description: "d",
        state: "In Progress",
        url: "https://example.org/issues/MT-NC"
      }

      entry = %{
        pid: self(),
        ref: make_ref(),
        identifier: "MT-NC",
        issue: issue,
        issue_id: "issue-no-cost",
        session_id: "s1",
        turn_count: 0,
        last_codex_message: nil,
        last_codex_timestamp: nil,
        last_codex_event: nil,
        started_at: DateTime.utc_now(),
        codex_input_tokens: 10,
        codex_output_tokens: 5,
        codex_total_tokens: 15,
        codex_last_reported_input_tokens: 10,
        codex_last_reported_output_tokens: 5,
        codex_last_reported_total_tokens: 15,
        codex_app_server_pid: nil,
        recent_events: []
      }

      state
      |> Map.put(:running, %{"issue-no-cost" => entry})
      |> Map.put(:claimed, MapSet.put(state.claimed, "issue-no-cost"))
    end)

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert entry.cost.input_cost_usd == 0.0
    assert entry.cost.output_cost_usd == 0.0
    assert entry.cost.total_cost_usd == 0.0
  end

  test "state_payload codex_totals gets cost defaults even when totals has no cost keys" do
    {name, pid} = start_orchestrator(:TotalsCostDefaults)

    :sys.replace_state(pid, fn state ->
      Map.put(state, :codex_totals, %{
        input_tokens: 500,
        output_tokens: 200,
        total_tokens: 700,
        seconds_running: 120
      })
    end)

    payload = Presenter.state_payload(name, 5_000)

    assert payload.codex_totals.input_tokens == 500
    assert payload.codex_totals.output_tokens == 200
    assert payload.codex_totals.total_tokens == 700
    assert payload.codex_totals.input_cost_usd == 0.0
    assert payload.codex_totals.output_cost_usd == 0.0
    assert payload.codex_totals.total_cost_usd == 0.0
  end

  test "state_payload includes generated_at timestamp" do
    {name, _pid} = start_orchestrator(:GeneratedAt)

    payload = Presenter.state_payload(name, 5_000)

    assert is_binary(payload.generated_at)
    assert {:ok, _, _} = DateTime.from_iso8601(payload.generated_at)
  end

  test "issue_payload includes recent_events and logs" do
    now = DateTime.utc_now()
    events = [%{at: now, event: :notification, message: "test event"}]

    {name, pid} = start_orchestrator(:IssueEvents)
    entry = inject_running(pid, "issue-ev", %{recent_events: events})

    assert {:ok, payload} = Presenter.issue_payload(entry.identifier, name, 5_000)

    assert length(payload.recent_events) == 1
    assert [%{event: :notification}] = payload.recent_events
    assert payload.logs.codex_session_logs == payload.recent_events
  end

  test "issue_payload falls back to last event when recent_events is empty" do
    now = DateTime.utc_now()

    {name, pid} = start_orchestrator(:IssueFallbackEvents)

    entry =
      inject_running(pid, "issue-fb", %{
        recent_events: [],
        last_codex_timestamp: now,
        last_codex_event: :session_started,
        last_codex_message: nil
      })

    assert {:ok, payload} = Presenter.issue_payload(entry.identifier, name, 5_000)

    assert length(payload.recent_events) == 1
    assert [%{event: :session_started}] = payload.recent_events
  end

  test "issue_payload workspace falls back to config root when paths missing" do
    {name, pid} = start_orchestrator(:IssueWorkspaceFallback)
    entry = inject_running(pid, "issue-ws", %{worker_host: nil, workspace_path: nil})

    assert {:ok, payload} = Presenter.issue_payload(entry.identifier, name, 5_000)

    assert is_binary(payload.workspace.path)
    assert String.contains?(payload.workspace.path, entry.identifier)
  end

  test "resume command without worker_host uses local cd" do
    {name, pid} = start_orchestrator(:ResumeLocal)

    inject_running(pid, "issue-local", %{
      session_id: "sess-local",
      worker_host: nil,
      workspace_path: "/work/local"
    })

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert entry.resume.command == "cd /work/local && claude --resume sess-local"
    refute entry.resume.command =~ "ssh"
  end

  test "resume command with only session_id" do
    {name, pid} = start_orchestrator(:ResumeMinimal)

    inject_running(pid, "issue-min", %{
      session_id: "sess-min",
      worker_host: nil,
      workspace_path: nil
    })

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert entry.resume.command == "claude --resume sess-min"
  end

  test "issue_payload returns not_found when orchestrator is unavailable" do
    assert {:error, :issue_not_found} =
             Presenter.issue_payload("MT-GONE", :nonexistent_issue_orch, 5_000)
  end

  test "resume command is nil when session_id is nil" do
    {name, pid} = start_orchestrator(:ResumeNilSession)

    inject_running(pid, "issue-nosess", %{session_id: nil})

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert is_nil(entry.resume.command)
  end

  test "running entry includes humanized last_codex_message" do
    {name, pid} = start_orchestrator(:HumanizedMessage)

    inject_running(pid, "issue-msg", %{
      last_codex_message: %{
        event: :notification,
        message: %{method: "some-method"},
        timestamp: DateTime.utc_now()
      }
    })

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert is_binary(entry.last_message)
  end

  test "state_payload codex_totals passes through non-map totals" do
    {name, pid} = start_orchestrator(:TotalsNonMap)

    :sys.replace_state(pid, fn state ->
      Map.put(state, :codex_totals, nil)
    end)

    payload = Presenter.state_payload(name, 5_000)
    assert is_nil(payload.codex_totals)
  end

  test "retry entry includes due_at as iso8601 and handles nil due_in_ms" do
    {name, pid} = start_orchestrator(:RetryDueAt)
    inject_retry(pid, "issue-due")

    payload = Presenter.state_payload(name, 5_000)
    [retry] = payload.retrying

    assert is_binary(retry.due_at)
    assert {:ok, _, _} = DateTime.from_iso8601(retry.due_at)
  end

  test "issue_payload returns retrying workspace from retry entry" do
    {name, pid} = start_orchestrator(:RetryWorkspace)
    retry = inject_retry(pid, "issue-rws", %{workspace_path: "/tmp/retry-ws", worker_host: "retry-host"})

    assert {:ok, payload} = Presenter.issue_payload(retry.identifier, name, 5_000)

    assert payload.workspace.path == "/tmp/retry-ws"
    assert payload.workspace.host == "retry-host"
  end

  test "running entry last_event_at and started_at are iso8601 strings" do
    {name, pid} = start_orchestrator(:Timestamps)
    inject_running(pid, "issue-ts")

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert is_binary(entry.started_at)
    assert {:ok, _, _} = DateTime.from_iso8601(entry.started_at)
    assert is_binary(entry.last_event_at)
    assert {:ok, _, _} = DateTime.from_iso8601(entry.last_event_at)
  end

  test "running entry with nil timestamps renders nil" do
    {name, pid} = start_orchestrator(:NilTimestamps)

    inject_running(pid, "issue-nts", %{
      last_codex_timestamp: nil,
      started_at: nil
    })

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert is_nil(entry.started_at)
    assert is_nil(entry.last_event_at)
  end

  test "issue_payload attempts section includes restart_count" do
    {name, pid} = start_orchestrator(:RestartCount)
    identifier = "MT-#{System.unique_integer([:positive])}"
    inject_running(pid, "issue-rc", %{identifier: identifier})
    inject_retry(pid, "issue-rc", %{identifier: identifier, attempt: 4})

    assert {:ok, payload} = Presenter.issue_payload(identifier, name, 5_000)

    assert payload.attempts.restart_count == 3
    assert payload.attempts.current_retry_attempt == 4
  end

  test "issue_payload attempts section handles nil retry" do
    {name, pid} = start_orchestrator(:NoRetryAttempts)
    entry = inject_running(pid, "issue-nra")

    assert {:ok, payload} = Presenter.issue_payload(entry.identifier, name, 5_000)

    assert payload.attempts.restart_count == 0
    assert payload.attempts.current_retry_attempt == 0
  end

  test "resume command with worker_host but no workspace_path" do
    {name, pid} = start_orchestrator(:ResumeHostOnly)

    inject_running(pid, "issue-ho", %{
      session_id: "sess-ho",
      worker_host: "remote-only",
      workspace_path: nil
    })

    payload = Presenter.state_payload(name, 5_000)
    [entry] = payload.running

    assert entry.resume.command == "ssh remote-only 'claude --resume sess-ho'"
  end

  test "issue_payload with only retry entry uses retry workspace and host" do
    {name, pid} = start_orchestrator(:RetryOnlyWorkspace)

    identifier = "MT-ROW"

    :sys.replace_state(pid, fn state ->
      retry = %{
        attempt: 1,
        due_at_ms: System.monotonic_time(:millisecond) + 10_000,
        identifier: identifier,
        issue_id: "issue-row",
        error: "err",
        worker_host: "retry-host-only",
        workspace_path: "/tmp/retry-only-ws",
        retry_token: make_ref()
      }

      state
      |> Map.put(:retry_attempts, %{"issue-row" => retry})
      |> Map.put(:claimed, MapSet.put(state.claimed, "issue-row"))
    end)

    assert {:ok, payload} = Presenter.issue_payload(identifier, name, 5_000)

    assert payload.workspace.path == "/tmp/retry-only-ws"
    assert payload.workspace.host == "retry-host-only"
  end

  test "issue_payload for running entry with nil session_id has nil resume command" do
    {name, pid} = start_orchestrator(:NilSessionResume)

    entry =
      inject_running(pid, "issue-nsr", %{
        session_id: nil,
        last_codex_message: %{event: :notification, message: %{method: "test"}, timestamp: DateTime.utc_now()}
      })

    assert {:ok, payload} = Presenter.issue_payload(entry.identifier, name, 5_000)

    assert is_nil(payload.resume.command)
    assert is_binary(payload.running.last_message)
  end
end
