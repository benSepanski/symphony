defmodule SymphonyElixir.Notifications do
  @moduledoc """
  Sends webhook notifications for observable orchestrator events.

  Configure via `notifications.webhook_url` in WORKFLOW.md. When set, events
  listed in `notifications.events` are POSTed as JSON to that URL.

  Supported events:
  - `"rate_limit"` — fired when rate-limit data is first detected in an agent update.
  - `"human_review"` — fired when an issue moves to a non-active, non-terminal state
    (e.g. Human Review) and the agent stops, indicating human attention is needed.
  """

  require Logger
  alias SymphonyElixir.Config
  alias SymphonyElixir.Linear.Issue

  @type event :: :rate_limit | :human_review

  @doc """
  Fires a `rate_limit` notification with the detected rate-limit map.
  No-ops when notifications are disabled or the webhook URL is not configured.
  """
  @spec notify_rate_limit(map()) :: :ok
  def notify_rate_limit(rate_limits) when is_map(rate_limits) do
    dispatch(:rate_limit, %{rate_limits: rate_limits})
  end

  @doc """
  Fires a `human_review` notification for an issue that moved to a non-active
  state and requires human attention.
  No-ops when notifications are disabled or the webhook URL is not configured.
  """
  @spec notify_human_review(Issue.t()) :: :ok
  def notify_human_review(%Issue{} = issue) do
    dispatch(:human_review, %{
      issue_id: issue.id,
      issue_identifier: issue.identifier,
      issue_title: issue.title,
      issue_state: issue.state,
      issue_url: issue.url
    })
  end

  # ---------------------------------------------------------------------------
  # Internal helpers
  # ---------------------------------------------------------------------------

  defp dispatch(event, payload) do
    case webhook_url_for_event(event) do
      nil ->
        :ok

      url ->
        Task.start(fn -> post_notification(url, event, payload) end)
        :ok
    end
  end

  defp webhook_url_for_event(event) do
    with {:ok, settings} <- Config.settings(),
         url when is_binary(url) and url != "" <- settings.notifications.webhook_url,
         true <- event_enabled?(event, settings.notifications.events) do
      url
    else
      _ -> nil
    end
  end

  defp event_enabled?(event, events) when is_list(events) do
    Enum.member?(events, Atom.to_string(event))
  end

  defp post_notification(url, event, payload) do
    body =
      Map.merge(payload, %{
        event: Atom.to_string(event),
        timestamp: DateTime.to_iso8601(DateTime.utc_now())
      })

    case Req.post(url, json: body) do
      {:ok, %{status: status}} when status in 200..299 ->
        Logger.debug("Notification sent event=#{event} status=#{status}")

      {:ok, %{status: status}} ->
        Logger.warning("Notification failed event=#{event} status=#{status}")

      {:error, reason} ->
        Logger.warning("Notification error event=#{event} reason=#{inspect(reason)}")
    end
  end
end
