.PHONY: help all setup deps build fmt fmt-check lint test coverage ci dialyzer e2e

MIX ?= mix

help:
	@echo "Targets: setup, deps, fmt, fmt-check, lint, test, coverage, dialyzer, e2e, ci"

setup:
	$(MIX) setup

deps:
	$(MIX) deps.get

build:
	$(MIX) build

fmt:
	$(MIX) format

fmt-check:
	$(MIX) format --check-formatted

lint:
	$(MIX) lint

coverage:
	$(MIX) test --cover

test:
	$(MIX) test

dialyzer:
	$(MIX) deps.get
	$(MIX) dialyzer --format short

e2e:
	SYMPHONY_RUN_LIVE_E2E=1 $(MIX) test test/symphony_elixir/live_e2e_test.exs

ci:
	@echo "::group::setup" && $(MAKE) setup && echo "::endgroup::"
	@echo "::group::build" && $(MAKE) build && echo "::endgroup::"
	@echo "::group::fmt-check" && $(MAKE) fmt-check && echo "::endgroup::"
	@echo "::group::lint" && $(MAKE) lint && echo "::endgroup::"
	@echo "::group::coverage" && $(MAKE) coverage && echo "::endgroup::"
	@echo "::group::dialyzer" && $(MAKE) dialyzer && echo "::endgroup::"

all: ci
