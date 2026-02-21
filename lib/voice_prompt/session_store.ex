defmodule VoicePrompt.SessionStore do
  @moduledoc """
  ETS-backed ephemeral session store for teleprompter state.
  Each session holds a script + settings, auto-expires after 30 minutes of inactivity.
  """
  use GenServer

  @table :voice_prompt_sessions
  @max_sessions 10_000
  @max_script_bytes 50_000
  @ttl_ms :timer.minutes(30)
  @sweep_interval_ms :timer.seconds(60)

  # ── Public API ──

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Create a new session with defaults. Returns :ok or {:error, reason}."
  def create(session_id) do
    now = System.monotonic_time(:millisecond)

    state = %{
      script: "",
      settings: %{},
      word_cursor: 0,
      updated_at: now
    }

    case :ets.info(@table, :size) do
      size when size >= @max_sessions -> {:error, :too_many_sessions}
      _ -> :ets.insert(@table, {session_id, state}); :ok
    end
  end

  @doc "Get session state. Returns {:ok, state} or :error."
  def get(session_id) do
    case :ets.lookup(@table, session_id) do
      [{^session_id, state}] -> {:ok, state}
      [] -> :error
    end
  end

  @doc "Update session state, touching updated_at. Enforces script size cap."
  def put(session_id, updates) when is_map(updates) do
    script = Map.get(updates, "script", "")

    if byte_size(script) > @max_script_bytes do
      {:error, :script_too_large}
    else
      now = System.monotonic_time(:millisecond)

      case get(session_id) do
        {:ok, existing} ->
          new_state =
            existing
            |> maybe_put(:script, updates["script"])
            |> maybe_put(:settings, updates["settings"])
            |> maybe_put(:word_cursor, updates["wordCursor"])
            |> Map.put(:updated_at, now)

          :ets.insert(@table, {session_id, new_state})
          :ok

        :error ->
          create(session_id)
          put(session_id, updates)
      end
    end
  end

  @doc "Delete a session."
  def delete(session_id) do
    :ets.delete(@table, session_id)
    :ok
  end

  @doc "Generate a URL-safe session ID."
  def generate_id do
    :crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)
  end

  # ── GenServer callbacks ──

  @impl true
  def init(_opts) do
    table = :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
    schedule_sweep()
    {:ok, %{table: table}}
  end

  @impl true
  def handle_info(:sweep, state) do
    sweep_expired()
    schedule_sweep()
    {:noreply, state}
  end

  defp schedule_sweep do
    Process.send_after(self(), :sweep, @sweep_interval_ms)
  end

  defp sweep_expired do
    now = System.monotonic_time(:millisecond)
    cutoff = now - @ttl_ms

    :ets.foldl(
      fn {session_id, %{updated_at: updated_at}}, acc ->
        if updated_at < cutoff, do: :ets.delete(@table, session_id)
        acc
      end,
      nil,
      @table
    )
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)
end
