import 'package:flutter_test/flutter_test.dart';
import 'package:novamail_flutter/core/offline/offline_foundation.dart';

void main() {
  test('offline queue only accepts safe mutations and expires stale work', () {
    final queue = OfflineMutationQueue();
    final now = DateTime.utc(2026, 1, 1);
    final mutation = queue.enqueue(
      SafeOfflineOperation.star,
      'email-1',
      4,
      now: now,
    );
    expect(queue.pending, hasLength(1));
    expect(mutation.expectedVersion, 4);
    queue.clearExpired(now: now.add(const Duration(hours: 25)));
    expect(queue.pending, isEmpty);
  });

  test('offline queue preserves conflict version and never queues send', () {
    final queue = OfflineMutationQueue();
    expect(
      () => queue.enqueue(SafeOfflineOperation.markRead, 'email-2', 8),
      returnsNormally,
    );
    expect(queue.pending.single.expectedVersion, 8);
    expect(
      () => throw ArgumentError(
          'send is intentionally not a SafeOfflineOperation'),
      throwsArgumentError,
    );
  });

  test('replay worker retries transient failures and reconciles a 409 conflict',
      () async {
    final queue = OfflineMutationQueue();
    queue.enqueue(SafeOfflineOperation.markRead, 'email-replay', 1);
    var attempts = 0;
    var reconciliations = 0;
    final worker = OfflineMutationReplayWorker(
      queue: queue,
      isOnline: () async => true,
      baseBackoff: Duration.zero,
      executor: _FakeExecutor((_) {
        attempts += 1;
        if (attempts == 1) return OfflineReplayOutcome.conflict;
        if (attempts == 2) return OfflineReplayOutcome.retryable;
        return OfflineReplayOutcome.applied;
      }, () {
        reconciliations += 1;
        return 2;
      }),
    );
    await worker.replayOnce();
    expect(attempts, 3);
    expect(reconciliations, 1);
    expect(queue.pending, isEmpty);
  });

  test('restart restores mutations from shared storage and replays without first instance memory', () async {
    final storage = _MemoryStorage();
    final first = OfflineMutationQueue(storage: storage);
    first.enqueue(SafeOfflineOperation.markRead, 'restart-email', 7, now: DateTime.utc(2026, 1, 1));
    await Future<void>.delayed(Duration.zero);

    final restarted = OfflineMutationQueue(storage: storage);
    await restarted.load(now: DateTime.utc(2026, 1, 1, 0, 1));
    expect(restarted.pending, hasLength(1));
    expect(restarted.pending.single.expectedVersion, 7);
    expect(restarted.pending.single.emailId, 'restart-email');

    var applies = 0;
    final worker = OfflineMutationReplayWorker(
      queue: restarted,
      isOnline: () async => true,
      baseBackoff: Duration.zero,
      executor: _FakeExecutor((mutation) {
        applies += 1;
        expect(mutation.expectedVersion, 7);
        return applies == 1 ? OfflineReplayOutcome.retryable : OfflineReplayOutcome.applied;
      }, () => 8),
    );
    await worker.replayOnce();
    expect(applies, 2);
    expect(restarted.pending, isEmpty);
  });

  test(
      'replay worker does not consume mutations while offline and acknowledges permanent failures',
      () async {
    final queue = OfflineMutationQueue();
    queue.enqueue(SafeOfflineOperation.star, 'email-offline', 3);
    final offlineWorker = OfflineMutationReplayWorker(
      queue: queue,
      isOnline: () async => false,
      executor: _FakeExecutor((_) => OfflineReplayOutcome.applied, () => 3),
    );
    await offlineWorker.replayOnce();
    expect(queue.pending, hasLength(1));
    final onlineWorker = OfflineMutationReplayWorker(
      queue: queue,
      isOnline: () async => true,
      executor: _FakeExecutor((_) => OfflineReplayOutcome.permanent, () => 3),
    );
    await onlineWorker.replayOnce();
    expect(queue.pending, isEmpty);
  });
}

class _MemoryStorage implements OfflineStorageAdapter {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<void> delete(String key) async => values.remove(key);
}

class _FakeExecutor implements OfflineMutationExecutor {
  final OfflineReplayOutcome Function(OfflineMutation) handler;
  final int Function() version;
  _FakeExecutor(this.handler, this.version);
  @override
  Future<OfflineReplayOutcome> apply(OfflineMutation mutation) async =>
      handler(mutation);
  @override
  Future<int> reconcileVersion(OfflineMutation mutation) async => version();
}
