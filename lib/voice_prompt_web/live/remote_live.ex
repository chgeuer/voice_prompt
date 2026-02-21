defmodule VoicePromptWeb.RemoteLive do
  use VoicePromptWeb, :live_view

  @impl true
  def mount(%{"session_id" => session_id}, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(VoicePrompt.PubSub, "remote:#{session_id}")
    end

    {:ok,
     assign(socket,
       page_title: "VoicePrompt Remote",
       session_id: session_id,
       connected: false,
       running: false,
       word_cursor: 0,
       total_words: 0,
       sentence_idx: 0,
       total_sentences: 0,
       scroll_mode: "voice",
       speed: 3,
       words: [],
       para_breaks: MapSet.new()
     )}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="remote-page">
      <!-- Header -->
      <div class="remote-header">
        <div class="remote-logo">
          <span>🎤</span>
          <span>VoicePrompt</span>
        </div>
        <span class="remote-badge">Remote</span>
      </div>

      <!-- Connection status -->
      <div class="connection-status">
        <div class={["status-dot", @connected && "connected"]}></div>
        <span class="status-text">
          <%= if @connected, do: "Connected", else: "Connecting..." %>
        </span>
      </div>

      <!-- Waiting screen -->
      <div :if={!@connected} class="waiting-screen">
        <div class="spinner"></div>
        <h2>Waiting for teleprompter</h2>
        <p>Open VoicePrompt on your computer and click "Remote" to connect</p>
      </div>

      <!-- Controls (shown when connected) -->
      <div :if={@connected} class="remote-controls-container">
        <!-- Progress -->
        <div class="remote-progress">
          <div class="progress-info">
            <span>Sentence <strong>{@sentence_idx}/{@total_sentences}</strong></span>
            <span>Word <strong>{@word_cursor + 1}/{@total_words}</strong></span>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              style={"width: #{if @total_words > 1, do: round(@word_cursor / (@total_words - 1) * 100), else: 0}%"}
            >
            </div>
          </div>
        </div>

        <!-- Controls -->
        <div class="remote-controls">
          <!-- Play / Pause -->
          <button
            class={["play-btn", @running && "running"]}
            phx-click="send_cmd"
            phx-value-action="toggle"
          >
            <%= if @running do %>
              ⏸ Pause
            <% else %>
              ▶ Start
            <% end %>
          </button>

          <!-- Word navigation -->
          <div class="nav-row">
            <button class="nav-btn" phx-click="send_cmd" phx-value-action="nudge_back">
              ← Back word
            </button>
            <button class="nav-btn" phx-click="send_cmd" phx-value-action="nudge_forward">
              → Next word
            </button>
          </div>

          <!-- Sentence navigation -->
          <div class="sentence-row">
            <button class="sentence-btn" phx-click="send_cmd" phx-value-action="prev_sentence">
              ⏪ Prev sentence
            </button>
            <button class="sentence-btn" phx-click="send_cmd" phx-value-action="next_sentence">
              ⏩ Next sentence
            </button>
          </div>

          <!-- Speed control -->
          <form class="speed-control" phx-change="send_cmd">
            <span class="speed-label">Speed</span>
            <input type="hidden" name="action" value="set_speed" />
            <input
              type="range"
              class="speed-slider"
              name="value"
              min="1"
              max="10"
              value={@speed}
            />
            <span class="speed-val">{@speed}</span>
          </form>

          <!-- Reset -->
          <button class="reset-btn" phx-click="send_cmd" phx-value-action="reset">
            🔄 Reset to beginning
          </button>
        </div>

        <!-- Script text display -->
        <div :if={@words != []} class="remote-script-display" id="remoteScriptDisplay" phx-hook="RemoteScroll">
          <div class="remote-script-header">
            <span>📜 SCRIPT</span>
          </div>
          <div class="remote-script-scroll" id="remoteScriptScroll">
            <div class="remote-script-text" id="remoteScriptText">
              <%= for {word, i} <- Enum.with_index(@words) do %>
                <span class="word" style={"opacity: #{word_opacity(i, @word_cursor)}"} data-idx={i}><%= word %> </span>
                <%= if MapSet.member?(@para_breaks, i) do %>
                  <span class="para-break"></span>
                <% end %>
              <% end %>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  defp word_opacity(i, cursor) do
    dist = i - cursor
    cond do
      dist < -20 -> 0.1
      dist < -8 -> 0.12
      dist < -3 -> 0.18
      dist < 0 -> 0.25
      dist == 0 -> 1.0
      dist <= 2 -> 0.95
      dist <= 5 -> 0.85
      dist <= 8 -> 0.7
      dist <= 12 -> 0.5
      dist <= 18 -> 0.3
      dist <= 30 -> 0.2
      true -> 0.12
    end
  end

  @impl true
  def handle_info({:state, state}, socket) do
    words = state["words"] || socket.assigns.words
    para_breaks = case state["paraBreaks"] do
      breaks when is_list(breaks) -> MapSet.new(breaks)
      _ -> socket.assigns.para_breaks
    end

    {:noreply,
     assign(socket,
       connected: true,
       running: state["running"] || false,
       word_cursor: state["wordCursor"] || 0,
       total_words: state["totalWords"] || 0,
       sentence_idx: state["sentenceIdx"] || 0,
       total_sentences: state["totalSentences"] || 0,
       scroll_mode: state["scrollMode"] || "voice",
       speed: state["speed"] || 3,
       words: words,
       para_breaks: para_breaks
     )}
  end

  def handle_info({:cmd, _cmd}, socket) do
    # Ignore command broadcasts (they're for the desktop app)
    {:noreply, socket}
  end

  @impl true
  def handle_event("send_cmd", %{"action" => action} = params, socket) do
    cmd = %{"action" => action}
    cmd = if params["value"], do: Map.put(cmd, "value", params["value"]), else: cmd

    Phoenix.PubSub.broadcast(
      VoicePrompt.PubSub,
      "remote:#{socket.assigns.session_id}",
      {:cmd, cmd}
    )

    {:noreply, socket}
  end
end
