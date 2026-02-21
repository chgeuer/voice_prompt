defmodule VoicePromptWeb.SessionRedirectController do
  use VoicePromptWeb, :controller

  def new(conn, _params) do
    session_id = VoicePrompt.SessionStore.generate_id()
    VoicePrompt.SessionStore.create(session_id)
    redirect(conn, to: ~p"/#{session_id}")
  end
end
