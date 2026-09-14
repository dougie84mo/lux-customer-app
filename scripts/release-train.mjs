#!/usr/bin/env node
// Release trains from this machine — Expo free plan edition (2026-09-13).
//
//   npm run update-train            OTA to channel `production` for iOS + Android.
//                                   0 build credits, 0 EAS workflow minutes.
//   npm run build-train -- ios      Native build + TestFlight submit      (1 iOS credit)
//   npm run build-train -- android  Native build + Play INTERNAL submit   (1 Android credit)
//   npm run build-train -- all      both
//
// Why a local script and not .eas/workflows: the free plan caps EAS Workflow
// jobs at 60 CI minutes a month, and September ran out on 2026-09-13 (the
// first update-train workflow failed on it). `eas update` and `eas build` run
// from the CLI spend neither those minutes nor, for updates, build credits.
//
// Update train gate: the native fingerprint of this checkout must match the
// newest finished production build on BOTH platforms. Otherwise the batch
// holds a native change and needs a build train (bump app.json version first).
// Policy: prompts/RELEASE_RUNBOOK.md "Release trains" (machine-local).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PLATFORMS = ['ios', 'android'];

function run(args, { capture = false } = {}) {
  const res = spawnSync('npx', ['eas', ...args], {
    shell: process.platform === 'win32',
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    if (capture) process.stderr.write(res.stderr ?? '');
    throw new Error(`eas ${args.join(' ')} exited with ${res.status}`);
  }
  return res.stdout ?? '';
}

function json(text) {
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error('no JSON in eas output');
  return JSON.parse(text.slice(start));
}

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8' });
  return (res.stdout ?? '').trim();
}

function latestProductionBuild(platform) {
  const list = json(
    run(['build:list', '--platform', platform, '--status', 'finished', '--limit', '10', '--json', '--non-interactive'], {
      capture: true,
    }),
  );
  const build = list.find((b) => b.buildProfile === 'production');
  if (!build) throw new Error(`no finished production ${platform} build found`);
  return build;
}

function trainMessage() {
  const file = '.eas/update-train.md';
  if (!existsSync(file)) return `update train ${new Date().toISOString().slice(0, 10)}`;
  const headings = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('## '));
  return headings.length ? `update train: ${headings[headings.length - 1].slice(3).trim()}` : 'update train';
}

function preflight() {
  const status = git(['status', '-sb']).split('\n')[0];
  if (/ahead|behind/.test(status)) {
    throw new Error(`git is not in sync with origin (${status}). Push or pull first so the update matches main.`);
  }
  const dirty = git(['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .filter((l) => !/\ssupabase\//.test(l)); // backend files are not part of the app bundle
  if (dirty.length) {
    throw new Error(`uncommitted app files would ship in the bundle:\n  ${dirty.join('\n  ')}`);
  }
}

function updateTrain({ dryRun }) {
  preflight();
  const version = JSON.parse(readFileSync('app.json', 'utf8')).expo.version;
  console.log(`\nUpdate train for runtime ${version} (no build credits)\n`);

  for (const platform of PLATFORMS) {
    const build = latestProductionBuild(platform);
    const cmp = json(
      run(
        ['fingerprint:compare', '--build-id', build.id, '--environment', 'production', '--json', '--non-interactive'],
        { capture: true },
      ),
    );
    const buildHash = cmp.fingerprint1?.hash;
    const localHash = cmp.fingerprint2?.hash;
    const same = buildHash && buildHash === localHash;
    console.log(
      `${platform.padEnd(8)} build ${build.appVersion} (${build.appBuildVersion}) ${same ? 'MATCHES' : 'DIFFERS'} this checkout`,
    );
    if (build.appVersion !== version) {
      throw new Error(
        `${platform}: newest production build is ${build.appVersion} but app.json says ${version}. ` +
          'An update would target a runtime no installed build runs. Needs a build train.',
      );
    }
    if (!same) {
      throw new Error(
        `${platform}: native change since build ${build.appBuildVersion}. This batch needs a build train ` +
          '(bump app.json version, then npm run build-train -- all). See `eas fingerprint:compare --build-id ' +
          `${build.id} --environment production` + '` for the paths.',
      );
    }
  }

  const message = trainMessage();
  if (dryRun) {
    console.log(`\nDry run: would publish "${message}" to branch production for ${PLATFORMS.join(' + ')}.`);
    return;
  }
  for (const platform of PLATFORMS) {
    console.log(`\nPublishing ${platform}…`);
    run([
      'update',
      '--branch', 'production',
      '--environment', 'production',
      '--platform', platform,
      '--message', process.platform === 'win32' ? JSON.stringify(message) : message,
      '--non-interactive',
    ]);
  }
  console.log('\nDone. Testers: fully close the app, open it, close it, open it again.');
}

function buildTrain(target) {
  const platforms = target === 'all' ? PLATFORMS : [target];
  if (!platforms.every((p) => PLATFORMS.includes(p))) {
    throw new Error('usage: npm run build-train -- ios|android|all');
  }
  const usage = json(run(['account:usage', 'jdfan', '--json', '--non-interactive'], { capture: true }));
  for (const p of platforms) {
    const plan = usage.builds?.[p]?.plan;
    const left = plan ? plan.limit - plan.used : 0;
    console.log(`${p.padEnd(8)} ${left} build credits left this month`);
    if (left < 1) throw new Error(`${p}: no build credits left this month. Use eas build --local or wait for the reset.`);
  }
  for (const p of platforms) {
    // Android MUST submit with the `internal` profile: the `production` submit
    // profile targets the Play production track.
    const submit = p === 'android' ? ['--auto-submit-with-profile', 'internal'] : ['--auto-submit'];
    console.log(`\nBuilding ${p}…`);
    run(['build', '--platform', p, '--profile', 'production', ...submit]);
  }
}

try {
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'update') updateTrain({ dryRun: arg === '--dry-run' });
  else if (mode === 'build') buildTrain(arg ?? '');
  else throw new Error('usage: node scripts/release-train.mjs update [--dry-run] | build ios|android|all');
} catch (err) {
  console.error(`\n✖ ${err.message}\n`);
  process.exit(1);
}
