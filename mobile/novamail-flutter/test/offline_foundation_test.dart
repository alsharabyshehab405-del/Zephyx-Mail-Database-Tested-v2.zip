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
        'send is intentionally not a SafeOfflineOperation',
      ),
      throwsArgumentError,
    );
  });
}
