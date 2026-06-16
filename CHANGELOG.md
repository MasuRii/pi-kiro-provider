# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-06-16

### Fixed
- Validated that parsed model cost values are non-negative finite numbers to prevent invalid cost metadata from silently passing through.
- Added stricter bounds checking for malformed event stream frames, returning `null` instead of silently reading past the header section boundary.

## [0.2.0] - 2026-06-01

### Added
- Added lazy loading for Kiro OAuth and streaming modules to reduce startup cost.

### Changed
- Widened Pi peer dependency compatibility to include Pi 0.77.x and 0.78.x.

### Fixed
- Corrected the default Kiro API key placeholder to reference `$KIRO_ACCESS_TOKEN` consistently in config and docs.

## [0.1.0] - 2026-05-27

### Added
- Prepared npm/GitHub release metadata, package contents, README, changelog, license, and package ignore rules for public review.
- Added the initial Kiro provider extension with OAuth registration, Pi provider registration, runtime provider replay for pi-multi-auth, configurable model metadata, and file-gated debug logging.
