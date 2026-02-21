defmodule VoicePromptWeb.Router do
  use VoicePromptWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {VoicePromptWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", VoicePromptWeb do
    pipe_through :browser

    # Redirect / to a fresh session
    get "/", SessionRedirectController, :new

    live_session :teleprompter, root_layout: {VoicePromptWeb.Layouts, :bare} do
      live "/:session_id", AppLive
      live "/remote/:session_id", RemoteLive
    end
  end

  # Other scopes may use custom stacks.
  # scope "/api", VoicePromptWeb do
  #   pipe_through :api
  # end
end
