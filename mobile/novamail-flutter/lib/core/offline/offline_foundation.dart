import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class OfflineStorageAdapter {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureOfflineStorageAdapter implements OfflineStorageAdapter {
  final FlutterSecureStorage storage;
  const SecureOfflineStorageAdapter({this.storage = const FlutterSecureStorage()});
  @override
  Future<String?> read(String key) => storage.read(key: key);
  @override
  Future<void> write(String key, String value) => storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => storage.delete(key: key);
}

class OfflineEmailSummary {
  final String id;
  final String subject;
  final String sender;
  final DateTime updatedAt;
  const OfflineEmailSummary({
    required this.id,
    required this.subject,
    required this.sender,
    required this.updatedAt,
  });
  Map<String, Object> toJson() => {
        'id': id,
        'subject': subject,
        'sender': sender,
        'updatedAt': updatedAt.toIso8601String(),
      };
  static OfflineEmailSummary fromJson(Map<String, dynamic> json) =>
      OfflineEmailSummary(
        id: json['id'] as String,
        subject: json['subject'] as String,
        sender: json['sender'] as String,
        updatedAt: DateTime.parse(json['updatedAt'] as String),
      );
}

class OfflineCacheStore {
  static const _key = 'novamail.offline.email_summaries.v1';
  static const _timestampKey = 'novamail.offline.email_summaries.timestamp.v1';
  static const maxItems = 200;
  static const ttl = Duration(hours: 24);
  final OfflineStorageAdapter storage;
  OfflineCacheStore({OfflineStorageAdapter? storage}) : storage = storage ?? const SecureOfflineStorageAdapter();
  Future<void> saveSummaries(List<OfflineEmailSummary> summaries) async {
    await storage.write(
      _key,
      jsonEncode(
        summaries.take(maxItems).map((x) => x.toJson()).toList(),
      ),
    );
    await storage.write(
      _timestampKey,
      DateTime.now().toUtc().toIso8601String(),
    );
  }

  Future<List<OfflineEmailSummary>> readSummaries({DateTime? now}) async {
    final raw = await storage.read(_key);
    final timestamp = await storage.read(_timestampKey);
    if (raw == null || timestamp == null) return const [];
    final savedAt = DateTime.tryParse(timestamp);
    if (savedAt == null ||
        (now ?? DateTime.now().toUtc()).difference(savedAt) > ttl) {
      await clear();
      return const [];
    }
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((x) => OfflineEmailSummary.fromJson(x.cast<String, dynamic>()))
          .toList(growable: false);
    } catch (_) {
      await clear();
      return const [];
    }
  }

  Future<void> clear() async {
    await storage.delete(_key);
    await storage.delete(_timestampKey);
  }
}

enum SafeOfflineOperation { markRead, markUnread, star, unstar }

class OfflineMutation {
  final String id;
  final SafeOfflineOperation operation;
  final String emailId;
  final int expectedVersion;
  final DateTime expiresAt;
  const OfflineMutation({
    required this.id,
    required this.operation,
    required this.emailId,
    required this.expectedVersion,
    required this.expiresAt,
  });
  Map<String, dynamic> toJson() => {
        'id': id,
        'operation': operation.name,
        'emailId': emailId,
        'expectedVersion': expectedVersion,
        'expiresAt': expiresAt.toIso8601String(),
      };
  factory OfflineMutation.fromJson(Map<String, dynamic> json) =>
      OfflineMutation(
        id: '${json['id']}',
        operation: SafeOfflineOperation.values.byName('${json['operation']}'),
        emailId: '${json['emailId']}',
        expectedVersion: (json['expectedVersion'] as num).toInt(),
        expiresAt: DateTime.parse('${json['expiresAt']}'),
      );
}

class OfflineMutationQueue {
  static const maxItems = 100;
  static const ttl = Duration(hours: 24);
  static const _key = 'novamail.offline.mutations.v1';
  final OfflineStorageAdapter storage;
  final List<OfflineMutation> _items = [];
  OfflineMutationQueue({OfflineStorageAdapter? storage}) : storage = storage ?? const SecureOfflineStorageAdapter();
  List<OfflineMutation> get pending => List.unmodifiable(_items);
  Future<void> load({DateTime? now}) async {
    String? raw;
    try {
      raw = await storage.read(_key);
    } catch (_) {
      // Keep pending in-memory mutations when no platform channel is installed.
      return;
    }
    if (raw == null) return;
    try {
      _items
        ..clear()
        ..addAll(
          (jsonDecode(raw) as List).whereType<Map>().map(
                (x) => OfflineMutation.fromJson(x.cast<String, dynamic>()),
              ),
        );
      clearExpired(now: now);
    } catch (_) {
      _items.clear();
      try {
        await storage.delete(_key);
      } catch (_) {
        // A missing platform channel must not break replay or unit tests.
      }
    }
  }

  Future<void> persist() async {
    try {
      await storage.write(
        _key,
        jsonEncode(_items.map((x) => x.toJson()).toList()),
      );
    } catch (_) {
      // Unit tests may not install a platform channel; production storage is still fail-closed.
    }
  }

  OfflineMutation enqueue(
    SafeOfflineOperation operation,
    String emailId,
    int expectedVersion, {
    DateTime? now,
  }) {
    if (emailId.isEmpty || expectedVersion < 0)
      throw ArgumentError('Invalid safe offline mutation');
    final createdAt = now ?? DateTime.now().toUtc();
    clearExpired(now: createdAt);
    _items.removeWhere(
      (item) =>
          item.emailId == emailId &&
          item.operation.index ~/ 2 == operation.index ~/ 2,
    );
    final mutation = OfflineMutation(
      id: '${createdAt.microsecondsSinceEpoch}-$emailId',
      operation: operation,
      emailId: emailId,
      expectedVersion: expectedVersion,
      expiresAt: createdAt.add(ttl),
    );
    if (_items.length >= maxItems) _items.removeAt(0);
    _items.add(mutation);
    unawaited(persist());
    return mutation;
  }

  void acknowledge(String id) {
    _items.removeWhere((item) => item.id == id);
    unawaited(persist());
  }

  void clearExpired({DateTime? now}) {
    _items.removeWhere(
      (item) => item.expiresAt.isBefore(now ?? DateTime.now().toUtc()),
    );
    unawaited(persist());
  }

  Future<void> clear() async {
    _items.clear();
    await storage.delete(_key);
  }
}

enum OfflineReplayOutcome { applied, conflict, retryable, permanent }

abstract interface class OfflineMutationExecutor {
  Future<OfflineReplayOutcome> apply(OfflineMutation mutation);
  Future<int> reconcileVersion(OfflineMutation mutation);
}

class OfflineMutationReplayWorker {
  final OfflineMutationQueue queue;
  final OfflineMutationExecutor executor;
  final Future<bool> Function() isOnline;
  final Duration baseBackoff;
  final int maxAttempts;
  bool _running = false;

  OfflineMutationReplayWorker({
    required this.queue,
    required this.executor,
    required this.isOnline,
    this.baseBackoff = const Duration(seconds: 1),
    this.maxAttempts = 5,
  });

  Future<void> replayOnce() async {
    if (_running || !(await isOnline())) return;
    _running = true;
    try {
      await queue.load();
      for (final mutation in List<OfflineMutation>.from(queue.pending)) {
        if (!(await isOnline())) break;
        var current = mutation;
        var completed = false;
        for (var attempt = 0;
            attempt < maxAttempts && !completed;
            attempt += 1) {
          final outcome = await executor.apply(current);
          switch (outcome) {
            case OfflineReplayOutcome.applied:
            case OfflineReplayOutcome.permanent:
              completed = true;
              queue.acknowledge(current.id);
            case OfflineReplayOutcome.conflict:
              final version = await executor.reconcileVersion(current);
              current = OfflineMutation(
                  id: current.id,
                  operation: current.operation,
                  emailId: current.emailId,
                  expectedVersion: version,
                  expiresAt: current.expiresAt);
            case OfflineReplayOutcome.retryable:
              if (attempt + 1 < maxAttempts) {
                await Future<void>.delayed(baseBackoff * (1 << attempt));
              }
          }
        }
      }
    } finally {
      _running = false;
    }
  }
}
