# VoicePrompt (Self-Hosted)

A self-hosted voice-tracking teleprompter — paste your script, hit start, and speak naturally. VoicePrompt listens to your voice and scrolls word by word in real time. Control it from your phone. No foot pedals. No subscriptions. No external services. Just you.

This is a Phoenix LiveView port of [voiceprompt.live](https://voiceprompt.live/), the teleprompter that [Rutger Bregman](https://x.com/rcbregman) built with [Claude](https://claude.ai) and [announced on X](https://x.com/rcbregman/status/2022285071571464226). The original uses Firebase for remote control sync and an external service for QR code generation. This version replaces both with server-side implementations — Phoenix PubSub for real-time communication and the `qr_code` Elixir package for QR generation — so you can run the entire thing on your own machine with **zero external dependencies**.

## What you get

- 🎤 **Voice-controlled scrolling** — uses your browser's speech recognition to track your words in real time
- 📱 **Phone remote control** — scan a QR code, get play/pause/speed controls on your phone
- 🔎 **Word-by-word tracking** — a smooth spotlight follows your voice through the script
- 🖥 **Pop-out window** — detach the teleprompter to a second screen or external prompter display
- ⏲ **Auto-scroll mode** — fixed-speed scrolling for voiceovers or rehearsing
- 🔄 **Mirror mode** — flip horizontally for beam-splitter prompters
- 💾 **Session persistence** — your script and settings survive page reloads (stored server-side, no database needed)
- 🌐 **18 languages** supported

## Prerequisites

You'll need [Elixir](https://elixir-lang.org/install.html) installed. That's it — no database, no Node.js, no external APIs.

If you've never used Elixir before, the quickest path:

- **macOS**: `brew install elixir`
- **Ubuntu/Debian**: `sudo apt install elixir`
- **Windows**: download the installer from [elixir-lang.org](https://elixir-lang.org/install.html)
- **asdf**: `asdf install elixir latest && asdf global elixir latest`

Verify it works: `elixir --version` (you want 1.15+).

## Getting started

```bash
# Clone the repo and enter the directory
git clone https://github.com/chgeuer/voice_prompt.git voice_prompt
cd voice_prompt

# Install dependencies and build assets (one command does it all)
mix setup

# Start the server
mix phx.server
```

Open [http://localhost:4000](http://localhost:4000) in **Google Chrome** (required for voice recognition). You'll be redirected to a session URL like `http://localhost:4000/aBcDeFgH`.

### Using on your local network (recommended for phone remote)

The server binds to all network interfaces by default in dev mode. When you click the **📱 Remote** button, VoicePrompt automatically detects your machine's LAN IP address (e.g., `192.168.1.x`) and generates a QR code your phone can reach — no configuration needed.

If the detected IP isn't right, you can override it in `config/dev.exs`:

```elixir
config :voice_prompt, VoicePromptWeb.Endpoint,
  url: [host: "your-actual-hostname-or-ip"]
```

When you set an explicit host (anything other than `"localhost"`), VoicePrompt uses that value directly in the QR code URL.

## How it works

1. **Paste your script** into the editor
2. **Hit Start** — a 3-2-1 countdown begins, then voice tracking activates
3. **Speak naturally** — the teleprompter highlights each word as you say it and scrolls to keep up
4. **Pop out** the teleprompter window and drag it to your camera-facing screen
5. **Scan the QR code** with your phone to get a wireless remote control

### Architecture (for the curious)

The app is a single Phoenix LiveView with a JavaScript hook that handles all the real-time voice work client-side (speech recognition via the Web Speech API, fuzzy word matching, scrolling). The server handles:

- **Session persistence** — script text and settings are stored in an in-memory ETS table with a 30-minute TTL, so reloading the page doesn't lose your work
- **Remote control relay** — Phoenix PubSub replaces Firebase as the real-time channel between your desktop and phone
- **QR code generation** — SVG QR codes are rendered server-side, no external API calls

## FAQ

### Wait, it's really free?

Yes. Completely free. No trial, no freemium, no "enter your credit card." Clone it, run it, use it.

### Why does it require Google Chrome?

VoicePrompt relies on Chrome's built-in Speech Recognition API for voice tracking — it's the only browser that supports it reliably. Auto-scroll mode and keyboard controls work in other browsers, but for voice-controlled scrolling, Chrome is required.

### Does it require an internet connection?

Voice tracking requires internet because Chrome sends audio to Google's servers for recognition. The phone remote needs your phone and computer to be on the same network. Auto-scroll mode works fully offline once the page is loaded.

### How does the phone remote work?

Click **📱 Remote** in the sidebar, then scan the QR code with your phone. Your phone becomes a wireless remote with play/pause, forward/back, sentence navigation, and speed controls. No app install needed — it works in your phone's browser. Communication goes through the Phoenix server on your local network (not through any cloud service).

### What's the difference between voice mode and auto-scroll?

Voice mode uses speech recognition to follow along as you speak — it moves when you move. Auto-scroll moves at a fixed speed you control with a slider (or from your phone). Use voice mode for natural delivery, auto-scroll for rehearsing at a steady pace.

### Can I use it for long recordings (30+ minutes)?

Yes. There's no time limit. The voice recognition auto-restarts if Chrome's speech API times out, so it works seamlessly for long sessions.

### What if my accent isn't recognized well?

The matching algorithm is fuzzy — it doesn't need perfect recognition. It matches partial words and skipped words. You also have keyboard arrow keys as a backup to nudge the position.

### How is this different from the original voiceprompt.live?

The teleprompter itself is identical. The differences are under the hood:

| | voiceprompt.live | This version |
|---|---|---|
| Remote control sync | Firebase (Google cloud) | Phoenix PubSub (your machine) |
| QR codes | External API (quickchart.io) | Server-side SVG generation |
| Session storage | Browser localStorage | Server-side ETS (survives reloads) |
| Hosting | Hosted for you | Self-hosted |
| Privacy | Script text stays in your browser | Script text stays on your machine |

### Who built this?

The original [VoicePrompt](https://voiceprompt.live/) was built by [Claude](https://claude.ai) under the creative direction of [Rutger Bregman](https://x.com/rcbregman) — "an AI that can build anything, and a human who can barely find the terminal." This Phoenix port was also built with AI from the cloud, replacing the cloud dependencies with self-hosted alternatives.

## Development

```bash
# Run the server with live reload
mix phx.server

# Run tests
mix test

# Format code, check warnings, run tests
mix precommit
```
