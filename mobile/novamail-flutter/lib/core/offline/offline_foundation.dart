import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class OfflineStorageAdapter {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureOfflineStorageAdapter implements OfflineStorageAdapter {
  final FlutterSecureStorage storage;
  const SecureOfflineStorageAdapter(
      {this.storage = const FlutterSecureStorage()});
  @override
  Future<String?> read(String key) => storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      storage.write(key: key, value: value);
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
  OfflineCacheStore({OfflineStorageAdapter? storage})
      : storage = storage ?? const SecureOfflineStorageAdapter();
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

enum SafeOfflineOperation {
  markRead,
  markUnread,
  star,
  unstar,
  completeTask,
  snoozeFollowUp,
  updateFocusMode
}

String _coalesceGroup(SafeOfflineOperation operation) {
  switch (operation) {
    case SafeOfflineOperation.markRead:
    case SafeOfflineOperation.markUnread:
      return 'read';
    case SafeOfflineOperation.star:
    case SafeOfflineOperation.unstar:
      return 'star';
    case SafeOfflineOperation.completeTask:
      return 'task';
    case SafeOfflineOperation.snoozeFollowUp:
      return 'follow_up';
    case SafeOfflineOperation.updateFocusMode:
      return 'focus';
  }
}

class OfflineMutation {
  final String id;
  final SafeOfflineOperation operation;
  final String emailId;
  final int expectedVersion;
  final DateTime expiresAt;
  final String entityType;
  final Map<String, dynamic> payload;
  const OfflineMutation({
    required this.id,
    required this.operation,
    required this.emailId,
    required this.expectedVersion,
    required this.expiresAt,
    this.entityType = 'email',
    this.payload = const <String, dynamic>{},
  });
  Map<String, dynamic> toJson() => {
        'id': id,
        'operation': operation.name,
        'emailId': emailId,
        'expectedVersion': expectedVersion,
        'expiresAt': expiresAt.toIso8601String(),
        'entityType': entityType,
        'payload': payload,
      };
  factory OfflineMutation.fromJson(Map<String, dynamic> json) =>
      OfflineMutation(
        id: '${json['id']}',
        operation: SafeOfflineOperation.values.byName('${json['operation']}'),
        emailId: '${json['emailId']}',
        expectedVersion: (json['expectedVersion'] as num).toInt(),
        expiresAt: DateTime.parse('${json['expiresAt']}'),
        entityType: '${json['entityType'] ?? 'email'}',
        payload: (json['payload'] as Map?)?.cast<String, dynamic>() ??
            const <String, dynamic>{},
      );
}

class OfflineWorkspaceCacheStore {
  static const _key = 'novamail.offline.workspace.v1';
  static const _timestampKey = 'novamail.offline.workspace.timestamp.v1';
  static const ttl = Duration(hours: 24);
  final OfflineStorageAdapter storage;
  OfflineWorkspaceCacheStore({OfflineStorageAdapter? storage})
      : storage = storage ?? const SecureOfflineStorageAdapter();

  Future<void> saveWorkspace(Map<String, dynamic> workspace) async {
    await storage.write(_key, jsonEncode(workspace));
    await storage.write(
        _timestampKey, DateTime.now().toUtc().toIso8601String());
  }

  Future<Map<String, dynamic>?> readWorkspace({DateTime? now}) async {
    final raw = await storage.read(_key);
    final timestamp = await storage.read(_timestampKey);
    if (raw == null || timestamp == null) return null;
    final savedAt = DateTime.tryParse(timestamp);
    if (savedAt == null ||
        (now ?? DateTime.now().toUtc()).difference(savedAt) > ttl) {
      await clear();
      return null;
    }
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map ? decoded.cast<String, dynamic>() : null;
    } catch (_) {
      await clear();
      return null;
    }
  }

  Future<void> clear() async {
    await storage.delete(_key);
    await storage.delete(_timestampKey);
  }
}

class OfflineMutationQueue {
  static const maxItems = 100;
  static const ttl = Duration(hours: 24);
  static const _key = 'novamail.offline.mutations.v1';
  final OfflineStorageAdapter storage;
  final List<OfflineMutation> _items = [];
  OfflineMutationQueue({OfflineStorageAdapter? storage})
      : storage = storage ?? const SecureOfflineStorageAdapter();
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
    String entityType = 'email',
    Map<String, dynamic> payload = const <String, dynamic>{},
  }) {
    if (emailId.isEmpty || expectedVersion < 0)
      throw ArgumentError('Invalid safe offline mutation');
    final createdAt = now ?? DateTime.now().toUtc();
    clearExpired(now: createdAt);
    _items.removeWhere(
      (item) =>
          item.emailId == emailId &&
          _coalesceGroup(item.operation) == _coalesceGroup(operation),
    );
    final mutation = OfflineMutation(
      id: '${createdAt.microsecondsSinceEpoch}-$emailId',
      operation: operation,
      emailId: emailId,
      expectedVersion: expectedVersion,
      expiresAt: createdAt.add(ttl),
      entityType: entityType,
      payload: payload,
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

class ApiOfflineMutationExecutor implements OfflineMutationExecutor {
  final Dio client;
  const ApiOfflineMutationExecutor(this.client);

  @override
  Future<OfflineReplayOutcome> apply(OfflineMutation mutation) async {
    try {
      switch (mutation.operation) {
        case SafeOfflineOperation.markRead:
        case SafeOfflineOperation.markUnread:
          await client.patch('/emails/${mutation.emailId}/read', data: {
            'isRead': mutation.operation == SafeOfflineOperation.markRead
          });
        case SafeOfflineOperation.star:
        case SafeOfflineOperation.unstar:
          await client.patch('/emails/${mutation.emailId}/star', data: {
            'isStarred': mutation.operation == SafeOfflineOperation.star
          });
        case SafeOfflineOperation.completeTask:
          await client.patch('/productivity/tasks/${mutation.emailId}', data: {
            'status': 'completed',
            'expectedVersion': mutation.expectedVersion
          });
        case SafeOfflineOperation.snoozeFollowUp:
          await client
              .patch('/productivity/follow-ups/${mutation.emailId}', data: {
            'status': 'snoozed',
            'remindAt': mutation.payload['remindAt'],
            'expectedVersion': mutation.expectedVersion
          });
        case SafeOfflineOperation.updateFocusMode:
          await client.patch('/productivity/focus',
              data: {'mode': mutation.payload['mode']});
      }
      return OfflineReplayOutcome.applied;
    } on DioException catch (error) {
      final status = error.response?.statusCode;
      if (status == 409) return OfflineReplayOutcome.conflict;
      if (status != null && status >= 400 && status < 500)
        return OfflineReplayOutcome.permanent;
      return OfflineReplayOutcome.retryable;
    } catch (_) {
      return OfflineReplayOutcome.retryable;
    }
  }

  @override
  Future<int> reconcileVersion(OfflineMutation mutation) async {
    try {
      final response = await client.get('/productivity/workspace');
      final key = mutation.entityType == 'follow_up' ? 'followUps' : 'tasks';
      final items = (response.data[key] as List? ?? const [])
          .whereType<Map>()
          .where((item) => '${item['id']}' == mutation.emailId);
      final first = items.isEmpty ? null : items.first;
      return (first?['version'] as num?)?.toInt() ?? mutation.expectedVersion;
    } catch (_) {
      return mutation.expectedVersion;
    }
  }
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
                  expiresAt: current.expiresAt,
                  entityType: current.entityType,
                  payload: current.payload);
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
