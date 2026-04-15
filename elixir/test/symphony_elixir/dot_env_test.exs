defmodule SymphonyElixir.DotEnvTest do
  use ExUnit.Case, async: true

  alias SymphonyElixir.DotEnv

  describe "parse/1" do
    test "parses simple KEY=VALUE lines" do
      assert DotEnv.parse("FOO=bar\nBAZ=qux") == [{"FOO", "bar"}, {"BAZ", "qux"}]
    end

    test "skips blank lines and comments" do
      input = """
      # this is a comment
      FOO=bar

      # another comment
      BAZ=qux
      """

      assert DotEnv.parse(input) == [{"FOO", "bar"}, {"BAZ", "qux"}]
    end

    test "handles double-quoted values" do
      assert DotEnv.parse(~s(FOO="hello world")) == [{"FOO", "hello world"}]
    end

    test "handles single-quoted values" do
      assert DotEnv.parse("FOO='hello world'") == [{"FOO", "hello world"}]
    end

    test "handles export prefix" do
      assert DotEnv.parse("export FOO=bar") == [{"FOO", "bar"}]
    end

    test "handles values with equals signs" do
      assert DotEnv.parse("FOO=bar=baz") == [{"FOO", "bar=baz"}]
    end

    test "handles empty values" do
      assert DotEnv.parse("FOO=") == [{"FOO", ""}]
    end

    test "skips lines without equals" do
      assert DotEnv.parse("NOEQUALSSIGN") == []
    end

    test "trims whitespace around keys and values" do
      assert DotEnv.parse("  FOO  =  bar  ") == [{"FOO", "bar"}]
    end
  end

  describe "load/1" do
    setup do
      dir = Path.join(System.tmp_dir!(), "dot-env-test-#{System.unique_integer([:positive])}")
      File.mkdir_p!(dir)
      env_path = Path.join(dir, ".env")

      on_exit(fn -> File.rm_rf!(dir) end)

      %{env_path: env_path}
    end

    test "loads variables from .env file", %{env_path: env_path} do
      key = "SYMPHONY_DOT_ENV_TEST_#{System.unique_integer([:positive])}"

      on_exit(fn -> System.delete_env(key) end)

      File.write!(env_path, "#{key}=test_value\n")

      assert :ok = DotEnv.load(env_path)
      assert System.get_env(key) == "test_value"
    end

    test "does not overwrite existing environment variables", %{env_path: env_path} do
      key = "SYMPHONY_DOT_ENV_EXISTING_#{System.unique_integer([:positive])}"

      on_exit(fn -> System.delete_env(key) end)

      System.put_env(key, "original")
      File.write!(env_path, "#{key}=overwritten\n")

      assert :ok = DotEnv.load(env_path)
      assert System.get_env(key) == "original"
    end

    test "silently ignores missing .env file" do
      assert :ok = DotEnv.load("/nonexistent/path/.env")
    end

    test "returns error for unreadable .env file", %{env_path: env_path} do
      # A directory path triggers :eisdir on File.read
      File.mkdir_p!(env_path)
      assert {:error, {:dot_env_read_error, ^env_path, _reason}} = DotEnv.load(env_path)
    end
  end

  test "parse/1 skips lines with empty key" do
    assert DotEnv.parse("=value") == []
  end
end
