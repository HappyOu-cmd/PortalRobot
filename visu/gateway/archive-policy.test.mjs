import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ArchivePolicyStore } from './archive-policy.mjs';
import { StatisticsStore } from './statistics-store.mjs';
import { CellEventStore } from './cell-events.mjs';
import { CyclogramStore, noDataStates } from './cyclogram.mjs';

const DAY_MS = 86_400_000;

test('сброс срока продлевает весь архив и сохраняется после перезапуска', () => {
  const directory = mkdtempSync(join(tmpdir(), 'portal-archive-policy-'));
  const databasePath = join(directory, 'policy.sqlite');
  let now = 1_000_000;
  let store;
  try {
    store = new ArchivePolicyStore({ databasePath, now: () => now, defaults: { events: 90 } });
    now += 82 * DAY_MS;
    assert.equal(store.policy('events').remainingDays, 8);
    store.renew('events', 'clock-reset', { id: 2, displayName: 'Администратор' });
    assert.equal(store.policy('events').remainingDays, 90);
    assert.deepEqual(store.expired(), []);
    store.close();
    store = new ArchivePolicyStore({ databasePath, now: () => now });
    assert.equal(store.policy('events').remainingDays, 90);
    assert.equal(store.recentActions()[0].actorName, 'Администратор');
    now += 90 * DAY_MS;
    assert.ok(store.expired().includes('events'));
    store.setRetentionDays('events', 30, null);
    assert.equal(store.policy('events').remainingDays, 30);
    assert.ok(!store.expired().includes('events'));
  } finally {
    store?.close();
    rmSync(databasePath, { force: true });
    rmdirSync(directory);
  }
});

test('некорректный срок не меняет политику', () => {
  const store = new ArchivePolicyStore();
  try {
    assert.throws(() => store.setRetentionDays('statistics', 0), /от 1 до 3650/);
    assert.equal(store.policy('statistics').retentionDays, 90);
  } finally {
    store.close();
  }
});

test('очистка каждого архива сохраняет живой операторский контекст', () => {
  const now = 2_000_000;
  const statistics = new StatisticsStore({ now: () => now });
  const events = new CellEventStore({ autoPrune: false });
  const cyclogram = new CyclogramStore({ autoPrune: false });
  try {
    statistics.openOperator({ id: 1, username: 'operator', displayName: 'Оператор', role: 'operator' }, now - 1_000);
    statistics.db.prepare(`INSERT INTO statistics_fact (timestamp_ms, kind, quantity) VALUES (?, 'alarm', 1)`).run(now - 500);
    const firstEvent = events.record({ timestampMs: now - 500, sourceId: 7, eventType: 'alarm', status: 'active', message: 'Тест' });
    cyclogram.record(noDataStates(), now - 500);
    assert.equal(statistics.clearArchive(now).facts, 1);
    assert.equal(statistics.archiveStatus().facts, 0);
    assert.equal(statistics.activeOperator().startMs, now);
    assert.equal(statistics.collectionStartedAt(), now);
    assert.equal(events.clearArchive(), 1);
    assert.equal(events.status().events, 0);
    const nextEvent = events.record({ timestampMs: now + 1, sourceId: 7, eventType: 'alarm', status: 'active', message: 'После очистки' });
    assert.ok(nextEvent.id > firstEvent.id);
    assert.equal(cyclogram.clear(), 4);
    assert.equal(cyclogram.status().intervals, 0);
  } finally {
    statistics.close();
    events.close();
    cyclogram.closeDatabase();
  }
});

test('файловые базы продолжают запись после очистки и уплотнения', () => {
  const directory = mkdtempSync(join(tmpdir(), 'portal-archive-data-'));
  const files = {
    statistics: join(directory, 'statistics.sqlite'),
    events: join(directory, 'events.sqlite'),
    cyclogram: join(directory, 'cyclogram.sqlite'),
  };
  let statistics;
  let events;
  let cyclogram;
  try {
    statistics = new StatisticsStore({ databasePath: files.statistics, now: () => 3_000_000 });
    events = new CellEventStore({ databasePath: files.events, autoPrune: false });
    cyclogram = new CyclogramStore({ databasePath: files.cyclogram, autoPrune: false });
    statistics.clearArchive(3_000_000);
    events.clearArchive();
    cyclogram.clear();
    statistics.db.prepare(`INSERT INTO statistics_fact (timestamp_ms, kind, quantity) VALUES (?, 'alarm', 1)`).run(3_000_001);
    const event = events.record({ timestampMs: 3_000_001, sourceId: 8, eventType: 'state', status: 'changed', message: 'После очистки' });
    assert.ok(event.id > 0);
    cyclogram.record(noDataStates(), 3_000_001);
    assert.equal(statistics.archiveStatus().facts, 1);
    assert.equal(events.status().events, 1);
    assert.equal(cyclogram.status().intervals, 4);
    events.clearArchive();
    events.close();
    events = new CellEventStore({ databasePath: files.events, autoPrune: false });
    const afterRestart = events.record({ timestampMs: 3_000_002, sourceId: 8, eventType: 'state', status: 'changed', message: 'После перезапуска' });
    assert.ok(afterRestart.id > event.id);
  } finally {
    statistics?.close();
    events?.close();
    cyclogram?.closeDatabase();
    for (const path of Object.values(files)) {
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
    }
    rmdirSync(directory);
  }
});
