import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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

  final FlutterSecureStorage storage;
  const OfflineCacheStore({this.storage = const FlutterSecureStorage()});

  Future<void> saveSummaries(List<OfflineEmailSummary> summaries) async {
    final limited = summaries
        .take(maxItems)
        .map((summary) => summary.toJson())
        .toList(growable: false);
    await storage.write(key: _key, value: jsonEncode(limited));
    await storage.write(
      key: _timestampKey,
      value: DateTime.now().toUtc().toIso8601String(),
    );
  }

  Future<List<OfflineEmailSummary>> readSummaries({DateTime? now}) async {
    final raw = await storage.read(key: _key);
    final timestamp = await storage.read(key: _timestampKey);
    if (raw == null || timestamp == null) return const [];
    final savedAt = DateTime.tryParse(timestamp);
    if (savedAt == null ||
        (now ?? DateTime.now().toUtc()).difference(savedAt) > ttl) {
      await clear();
      return const [];
    }
    try {
      final decoded = jsonDecode(raw) as List<dynamic>;
      return decoded
          .whereType<Map<String, dynamic>>()
          .map(OfflineEmailSummary.fromJson)
          .toList(growable: false);
    } catch (_) {
      await clear();
      return const [];
    }
  }

  Future<void> clear() async {
    await storage.delete(key: _key);
    await storage.delete(key: _timestampKey);
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
}

class OfflineMutationQueue {
  static const maxItems = 100;
  static const ttl = Duration(hours: 24);
  final List<OfflineMutation> _items = [];

  List<OfflineMutation> get pending => List.unmodifiable(_items);

  OfflineMutation enqueue(
    SafeOfflineOperation operation,
    String emailId,
    int expectedVersion, {
    DateTime? now,
  }) {
    if (emailId.isEmpty || expectedVersion < 0)
      throw ArgumentError('Invalid safe offline mutation');
    if (operation == SafeOfflineOperation.markRead ||
        operation == SafeOfflineOperation.markUnread ||
        operation == SafeOfflineOperation.star ||
        operation == SafeOfflineOperation.unstar) {
      final createdAt = now ?? DateTime.now().toUtc();
      final mutation = OfflineMutation(
        id: '${createdAt.microsecondsSinceEpoch}-$emailId',
        operation: operation,
        emailId: emailId,
        expectedVersion: expectedVersion,
        expiresAt: createdAt.add(ttl),
      );
      _items.removeWhere((item) => item.expiresAt.isBefore(createdAt));
      if (_items.length >= maxItems) _items.removeAt(0);
      _items.add(mutation);
      return mutation;
    }
    throw ArgumentError('Unsafe operation cannot be queued offline');
  }

  void acknowledge(String id) => _items.removeWhere((item) => item.id == id);
  void clearExpired({DateTime? now}) => _items.removeWhere(
    (item) => item.expiresAt.isBefore(now ?? DateTime.now().toUtc()),
  );
}
