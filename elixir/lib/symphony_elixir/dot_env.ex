defmodule SymphonyElixir.DotEnv do
  @moduledoc """
  Loads environment variables from a `.env` file.

  Parses KEY=VALUE lines and sets them via `System.put_env/2`.
  Silently ignores missing files. Existing environment variables are
  not overwritten.
  """

  @spec load(Path.t()) :: :ok | {:error, term()}
  def load(path) do
    case File.read(path) do
      {:ok, contents} ->
        for {key, value} <- parse(contents),
            is_nil(System.get_env(key)) do
          System.put_env(key, value)
        end

        :ok

      {:error, :enoent} ->
        :ok

      {:error, reason} ->
        {:error, {:dot_env_read_error, path, reason}}
    end
  end

  @spec parse(String.t()) :: [{String.t(), String.t()}]
  def parse(contents) when is_binary(contents) do
    contents
    |> String.split("\n")
    |> Enum.flat_map(&parse_line/1)
  end

  defp parse_line(line) do
    trimmed = String.trim(line)

    cond do
      trimmed == "" -> []
      String.starts_with?(trimmed, "#") -> []
      true -> parse_assignment(trimmed)
    end
  end

  defp parse_assignment(line) do
    case String.split(line, "=", parts: 2) do
      [raw_key, raw_value] ->
        key = raw_key |> String.trim() |> strip_export_prefix()
        value = raw_value |> String.trim() |> unquote_value()

        if key == "" do
          []
        else
          [{key, value}]
        end

      _ ->
        []
    end
  end

  defp strip_export_prefix("export " <> rest), do: String.trim_leading(rest)
  defp strip_export_prefix(key), do: key

  defp unquote_value(value) do
    cond do
      String.starts_with?(value, ~s(")) and String.ends_with?(value, ~s(")) and byte_size(value) >= 2 ->
        value |> String.slice(1..-2//1)

      String.starts_with?(value, "'") and String.ends_with?(value, "'") and byte_size(value) >= 2 ->
        value |> String.slice(1..-2//1)

      true ->
        value
    end
  end
end
