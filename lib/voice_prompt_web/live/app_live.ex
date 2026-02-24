defmodule VoicePromptWeb.AppLive do
  use VoicePromptWeb, :live_view

  @impl true
  def mount(%{"session_id" => session_id}, _session, socket) do
    # Ensure session exists in store (creates fresh if expired/unknown)
    case VoicePrompt.SessionStore.get(session_id) do
      :error -> VoicePrompt.SessionStore.create(session_id)
      _ -> :ok
    end

    if connected?(socket) do
      Phoenix.PubSub.subscribe(VoicePrompt.PubSub, "remote:#{session_id}")
    end

    # Load saved state to push to client after connect
    saved_state =
      case VoicePrompt.SessionStore.get(session_id) do
        {:ok, state} -> state
        :error -> %{}
      end

    socket =
      socket
      |> assign(
        page_title: "VoicePrompt",
        session_id: session_id,
        show_remote_modal: false,
        remote_url: nil,
        qr_svg: nil
      )
      |> then(fn s ->
        if connected?(s) and saved_state[:script] && saved_state[:script] != "" do
          push_event(s, "restore_state", %{
            script: saved_state[:script],
            settings: saved_state[:settings] || %{},
            wordCursor: saved_state[:word_cursor] || 0
          })
        else
          s
        end
      end)

    {:ok, socket}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div id="teleprompter-app" phx-hook="Teleprompter">
      <!-- Countdown overlay -->
      <div class="countdown-overlay" id="countdownOverlay" style="display:none;">3</div>

      <!-- App layout -->
      <div class="app-layout">
        <!-- Sidebar -->
        <div class="app-sidebar">
          <a class="sidebar-logo" href="/" style="text-decoration:none;color:inherit;">
            <span>🎤</span>
            <span>VoicePrompt</span>
          </a>

          <!-- Script section -->
          <div class="sidebar-group">
            <div class="group-header">
              <label>Your script</label>
              <div style="display:flex;gap:4px;margin-left:auto;">
                <button class="icon-btn" id="btnFileUpload" title="Load from file">📄 File</button>
                <button class="icon-btn" id="btnPaste" title="Paste from clipboard">📋 Paste</button>
              </div>
            </div>
            <textarea id="scriptInput" placeholder="Paste your script here...">
                This is VoicePrompt, and you're reading the tutorial right now. Hit Start below to try it.

                As you speak these words out loud, each word will light up in real time. Go ahead, just read naturally. The teleprompter follows your voice.

                You can pause whenever you want. Take a breath. The script waits for you. When you start speaking again, it picks right back up.

                Try going off-script for a moment. Say something random. Notice how VoicePrompt doesn't get confused. It finds your place when you come back.

                Now try the controls on the left. You can change the font size, switch languages, flip to mirror mode, or adjust the colors.

                Click Pop Out to move the display to a second screen. Click Remote to get a QR code for your phone.

                When you're ready, just clear this text and paste your own script. That's it. Happy prompting!
            </textarea>
            <div class="script-meta">
              <span class="reading-time" id="readingTime"></span>
              <input type="file" id="fileInput" accept=".txt,.md,.rtf" style="display:none;" />
            </div>
          </div>

          <!-- Action buttons -->
          <div class="sidebar-group">
            <div class="control-item" style="padding-bottom:6px;">
              <div class="control-label">
                ⏱ <span>Countdown (3-2-1)</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="countdownToggle" checked />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="action-buttons">
              <button class="btn-action btn-go" id="btnStart">
                <span class="btn-go-dot"></span>
                Start
              </button>
              <button class="btn-action btn-stop" id="btnStop">
                ⏹ Stop
              </button>
            </div>
            <div class="action-buttons-secondary">
              <button class="btn-subtle" id="btnReset">🔄 Reset</button>
              <button class="btn-subtle" id="btnPopout">↗ Pop out</button>
              <button class="btn-subtle" id="btnRemote" phx-click="show_remote">📱 Remote</button>
            </div>
          </div>

          <!-- Scrolling -->
          <div class="sidebar-group">
            <div class="group-header">
              <label>Scrolling</label>
            </div>

            <div class="control-item">
              <div class="control-label">
                ▶ <span>Scroll mode</span>
              </div>
              <select id="scrollMode">
                <option value="voice">Voice tracking</option>
                <option value="auto">Auto-scroll (fixed speed)</option>
              </select>
            </div>

            <div class="control-item">
              <div class="control-label">
                → <span>Scroll speed</span>
                <span class="control-value" id="scrollSpeedVal">3</span>
              </div>
              <input type="range" id="scrollSpeed" min="1" max="10" value="3" />
            </div>

            <div class="control-item">
              <div class="control-label">
                🌐 <span>Language</span>
              </div>
              <select id="langSelect">
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="nl-NL">Nederlands</option>
                <option value="de-DE">Deutsch</option>
                <option value="fr-FR">Français</option>
                <option value="es-ES">Español</option>
                <option value="pt-BR">Português (BR)</option>
                <option value="it-IT">Italiano</option>
                <option value="ja-JP">日本語</option>
                <option value="ko-KR">한국어</option>
                <option value="zh-CN">中文 (简体)</option>
                <option value="hi-IN">हिन्दी</option>
                <option value="ar-SA">العربية</option>
                <option value="pl-PL">Polski</option>
                <option value="sv-SE">Svenska</option>
                <option value="da-DK">Dansk</option>
                <option value="nb-NO">Norsk</option>
              </select>
            </div>
          </div>

          <!-- Display -->
          <div class="sidebar-group">
            <div class="group-header">
              <label>Display</label>
            </div>

            <div class="control-item">
              <div class="control-label">
                🔤 <span>Font size</span>
                <span class="control-value" id="fontSizeVal">42px</span>
              </div>
              <input type="range" id="fontSize" min="20" max="100" value="42" />
            </div>

            <div class="control-item">
              <div class="control-label">
                📝 <span>Font</span>
              </div>
              <select id="fontFamily">
                <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">System (default)</option>
                <option value="'Georgia', 'Times New Roman', serif">Georgia (serif)</option>
                <option value="'Arial', 'Helvetica', sans-serif">Arial</option>
                <option value="'Verdana', sans-serif">Verdana</option>
                <option value="'Courier New', 'Consolas', monospace">Monospace</option>
                <option value="'Palatino Linotype', 'Book Antiqua', serif">Palatino</option>
              </select>
            </div>

            <div class="control-item">
              <div class="control-label">
                ⊞ <span>Text width</span>
                <span class="control-value" id="marginVal">100%</span>
              </div>
              <input type="range" id="marginSlider" min="40" max="100" value="100" step="5" />
            </div>

            <div class="control-item">
              <div class="control-label">
                ┼ <span>Reading line</span>
                <span class="control-value" id="scrollPosVal">Upper</span>
              </div>
              <input type="range" id="scrollPosSlider" min="20" max="70" value="30" step="10" />
            </div>

            <div class="control-item">
              <div class="control-label">
                🎨 <span>Colors</span>
              </div>
              <div class="color-pickers">
                <label class="color-picker-item">
                  <span>BG</span>
                  <input type="color" id="colorBg" value="#000000" />
                </label>
                <label class="color-picker-item">
                  <span>Text</span>
                  <input type="color" id="colorText" value="#ffffff" />
                </label>
              </div>
            </div>

            <div class="control-item">
              <div class="control-label">
                ☀ <span>Light display</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="themeToggle" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="control-item">
              <div class="control-label">
                🪞 <span>Mirror mode</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="mirrorToggle" />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Voice status -->
          <div class="voice-status" id="voiceStatus" role="status"></div>

          <!-- Shortcuts -->
          <div class="sidebar-footer">
            <div class="shortcuts-label">Keyboard shortcuts</div>
            <div class="shortcuts-grid">
              <kbd>Space</kbd><span>start / stop</span>
              <kbd>← →</kbd><span>nudge word</span>
              <kbd>↑ ↓</kbd><span>jump sentence</span>
            </div>
          </div>
        </div>

        <!-- Teleprompter display -->
        <div class="app-main" id="prompterMain">
          <div class="app-main-header">
            <span>TELEPROMPTER</span>
            <span id="posIndicator">–</span>
          </div>
          <div class="progress-bar-track" id="progressTrack">
            <div class="progress-bar-fill" id="progressFill"></div>
          </div>
          <div class="app-main-scroll" id="prompterScroll">
            <div class="app-main-text" id="prompterText" phx-update="ignore"></div>
          </div>
        </div>
      </div>

      <!-- Remote QR modal -->
      <div
        :if={@show_remote_modal}
        class="remote-modal-overlay"
        id="remoteModal"
        phx-click="hide_remote"
      >
        <div class="remote-modal" phx-click-away="hide_remote">
          <div class="remote-modal-header">
            <h3>📱 Phone Remote</h3>
            <button class="remote-modal-close" phx-click="hide_remote">&times;</button>
          </div>
          <div class="remote-modal-body">
            <p>Scan this QR code with your phone to get a remote control</p>
            <div class="qr-container">
              {raw(@qr_svg)}
            </div>
            <div class="remote-url-row">
              <input type="text" value={@remote_url} readonly class="remote-url-input" id="remoteUrl" />
              <button class="icon-btn" id="btnCopyUrl" title="Copy URL" onclick="navigator.clipboard.writeText(document.getElementById('remoteUrl').value)">
                📋 Copy
              </button>
            </div>
            <div class="remote-status" id="remoteStatus">
              <span class="remote-status-dot"></span>
              Remote active — controls will appear on your phone
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("show_remote", _, socket) do
    session_id = socket.assigns.session_id
    remote_url = lan_base_url() <> "/remote/#{session_id}"

    qr_svg =
      remote_url
      |> QRCode.create(:low)
      |> QRCode.render(:svg, %QRCode.Render.SvgSettings{scale: 5})
      |> then(fn {:ok, svg} -> svg end)

    {:noreply,
     socket
     |> assign(show_remote_modal: true, remote_url: remote_url, qr_svg: qr_svg)
     |> push_event("enable_remote", %{})}
  end

  @impl true
  def handle_event("hide_remote", _, socket) do
    {:noreply, assign(socket, show_remote_modal: false)}
  end

  @impl true
  def handle_event("broadcast_state", state, socket) do
    Phoenix.PubSub.broadcast(
      VoicePrompt.PubSub,
      "remote:#{socket.assigns.session_id}",
      {:state, state}
    )

    {:noreply, socket}
  end

  @impl true
  def handle_event("save_state", state, socket) do
    VoicePrompt.SessionStore.put(socket.assigns.session_id, state)
    {:noreply, socket}
  end

  @impl true
  def handle_info({:cmd, cmd}, socket) do
    {:noreply, push_event(socket, "remote_cmd", cmd)}
  end

  def handle_info({:state, _state}, socket) do
    # Ignore our own state broadcasts
    {:noreply, socket}
  end

  defp lan_base_url do
    endpoint_url = VoicePromptWeb.Endpoint.url()
    uri = URI.parse(endpoint_url)

    if uri.host == "localhost" do
      %URI{uri | host: VoicePrompt.Network.lan_ip()} |> URI.to_string()
    else
      endpoint_url
    end
  end
end
