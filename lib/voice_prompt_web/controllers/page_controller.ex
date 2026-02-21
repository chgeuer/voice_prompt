defmodule VoicePromptWeb.PageController do
  use VoicePromptWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
