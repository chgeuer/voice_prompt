defmodule VoicePrompt.Network do
  @moduledoc """
  Detects the machine's LAN IP address for generating reachable URLs.
  """

  @doc """
  Returns the most likely externally-reachable LAN IP as a string,
  or "localhost" if none is found.

  Preference order: 192.168.x.x > 10.x.x > 172.16-31.x.x
  """
  @spec lan_ip() :: String.t()
  def lan_ip do
    {:ok, ifaddrs} = :inet.getifaddrs()

    ifaddrs
    |> Enum.flat_map(fn {_iface, opts} ->
      opts
      |> Keyword.get_values(:addr)
      |> Enum.filter(&match?({_, _, _, _}, &1))
    end)
    |> Enum.filter(&private_ip?/1)
    |> Enum.sort_by(&ip_priority/1)
    |> case do
      [{a, b, c, d} | _] -> "#{a}.#{b}.#{c}.#{d}"
      [] -> "localhost"
    end
  end

  defp private_ip?({192, 168, _, _}), do: true
  defp private_ip?({10, _, _, _}), do: true
  defp private_ip?({172, second, _, _}) when second in 16..31, do: true
  defp private_ip?(_), do: false

  # Lower number = higher preference
  defp ip_priority({192, 168, _, _}), do: 0
  defp ip_priority({10, _, _, _}), do: 1
  defp ip_priority({172, _, _, _}), do: 2
end
