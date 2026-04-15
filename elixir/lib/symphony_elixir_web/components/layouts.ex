defmodule SymphonyElixirWeb.Layouts do
  @moduledoc """
  Shared layouts for the observability dashboard.
  """

  use Phoenix.Component

  @spec root(map()) :: Phoenix.LiveView.Rendered.t()
  def root(assigns) do
    assigns = assign(assigns, :csrf_token, Plug.CSRFProtection.get_csrf_token())

    ~H"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="csrf-token" content={@csrf_token} />
        <title>Symphony Observability</title>
        <script defer src="/vendor/phoenix_html/phoenix_html.js"></script>
        <script defer src="/vendor/phoenix/phoenix.js"></script>
        <script defer src="/vendor/phoenix_live_view/phoenix_live_view.js"></script>
        <script>
          // Terminal log: filter lines by search query
          function filterTermLines(input) {
            var q = (input.value || "").toLowerCase();
            var termId = input.dataset.term;
            var container = termId ? document.getElementById(termId) : null;
            if (!container) return;
            container.querySelectorAll(".term-line").forEach(function (line) {
              line.style.display = (!q || line.textContent.toLowerCase().includes(q)) ? "" : "none";
            });
          }

          // Terminal log: auto-scroll to bottom unless user has scrolled up.
          // Uses data-pinned="false" to remember user intent across LiveView re-renders.
          function termScrollSetup(el) {
            if (el._termScrollBound) return;
            el._termScrollBound = true;
            el.addEventListener("scroll", function () {
              var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
              el.dataset.pinned = atBottom ? "true" : "false";
            }, {passive: true});
          }

          function termScrollUpdate(el) {
            termScrollSetup(el);
            if (el.dataset.pinned !== "false") {
              el.scrollTop = el.scrollHeight;
            }
          }

          window.addEventListener("phx:update", function () {
            document.querySelectorAll(".term-viewport").forEach(function (el) {
              termScrollUpdate(el);
              // Re-apply active search filter after re-render
              var searchInput = document.querySelector('[data-term="' + el.id + '"]');
              if (searchInput && searchInput.value) filterTermLines(searchInput);
            });
          });

          window.addEventListener("DOMContentLoaded", function () {
            document.querySelectorAll(".term-viewport").forEach(termScrollUpdate);

            var csrfToken = document
              .querySelector("meta[name='csrf-token']")
              ?.getAttribute("content");

            if (!window.Phoenix || !window.LiveView) return;

            var liveSocket = new window.LiveView.LiveSocket("/live", window.Phoenix.Socket, {
              params: {_csrf_token: csrfToken}
            });

            liveSocket.connect();
            window.liveSocket = liveSocket;
          });
        </script>
        <link rel="stylesheet" href="/dashboard.css" />
      </head>
      <body>
        {@inner_content}
      </body>
    </html>
    """
  end

  @spec app(map()) :: Phoenix.LiveView.Rendered.t()
  def app(assigns) do
    ~H"""
    <main class="app-shell">
      {@inner_content}
    </main>
    """
  end
end
