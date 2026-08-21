import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class OfflineEmailSummary {
  final String id; final String subject; final String sender; final DateTime updatedAt;
  const OfflineEmailSummary({required this.id, required this.subject, required this.sender, required this.updatedAt});
  Map<String, Object> toJson() => {'id': id, 'subject': subject, 'sender': sender, 'updatedAt': updatedAt.toIso8601String()};
  static OfflineEmailSummary fromJson(Map<String, dynamic> json) => OfflineEmailSummary(id: json['id'] as String, subject: json['subject'] as String, sender: json['sender'] as String, updatedAt: DateTime.parse(json['updatedAt'] as String));
}

class OfflineCacheStore {
  static const _key = 'novamail.offline.email_summaries.v1'; static const _timestampKey = 'novamail.offline.email_summaries.timestamp.v1'; static const maxItems = 200; static const ttl = Duration(hours: 24);
  final FlutterSecureStorage storage; const OfflineCacheStore({this.storage = const FlutterSecureStorage()});
  Future<void> saveSummaries(List<OfflineEmailSummary> summaries) async { await storage.write(key: _key, value: jsonEncode(summaries.take(maxItems).map((x) => x.toJson()).toList())); await storage.write(key: _timestampKey, value: DateTime.now().toUtc().toIso8601String()); }
  Future<List<OfflineEmailSummary>> readSummaries({DateTime? now}) async { final raw = await storage.read(key: _key); final timestamp = await storage.read(key: _timestampKey); if (raw == null || timestamp == null) return const []; final savedAt = DateTime.tryParse(timestamp); if (savedAt == null || (now ?? DateTime.now().toUtc()).difference(savedAt) > ttl) { await clear(); return const []; } try { return (jsonDecode(raw) as List).whereType<Map>().map((x) => OfflineEmailSummary.fromJson(x.cast<String, dynamic>())).toList(growable: false); } catch (_) { await clear(); return const []; } }
  Future<void> clear() async { await storage.delete(key: _key); await storage.delete(key: _timestampKey); }
}

enum SafeOfflineOperation { markRead, markUnread, star, unstar }
class OfflineMutation {
  final String id; final SafeOfflineOperation operation; final String emailId; final int expectedVersion; final DateTime expiresAt;
  const OfflineMutation({required this.id, required this.operation, required this.emailId, required this.expectedVersion, required this.expiresAt});
  Map<String, dynamic> toJson() => {'id': id, 'operation': operation.name, 'emailId': emailId, 'expectedVersion': expectedVersion, 'expiresAt': expiresAt.toIso8601String()};
  factory OfflineMutation.fromJson(Map<String, dynamic> json) => OfflineMutation(id: '${json['id']}', operation: SafeOfflineOperation.values.byName('${json['operation']}'), emailId: '${json['emailId']}', expectedVersion: (json['expectedVersion'] as num).toInt(), expiresAt: DateTime.parse('${json['expiresAt']}'));
}

class OfflineMutationQueue {
  static const maxItems = 100; static const ttl = Duration(hours: 24); static const _key = 'novamail.offline.mutations.v1';
  final FlutterSecureStorage storage; final List<OfflineMutation> _items = [];
  OfflineMutationQueue({this.storage = const FlutterSecureStorage()});
  List<OfflineMutation> get pending => List.unmodifiable(_items);
  Future<void> load({DateTime? now}) async { final raw = await storage.read(key: _key); if (raw == null) return; try { _items..clear()..addAll((jsonDecode(raw) as List).whereType<Map>().map((x) => OfflineMutation.fromJson(x.cast<String, dynamic>()))); clearExpired(now: now); } catch (_) { _items.clear(); await storage.delete(key: _key); } }
  Future<void> persist() async => storage.write(key: _key, value: jsonEncode(_items.map((x) => x.toJson()).toList()));
  OfflineMutation enqueue(SafeOfflineOperation operation, String emailId, int expectedVersion, {DateTime? now}) { if (emailId.isEmpty || expectedVersion < 0) throw ArgumentError('Invalid safe offline mutation'); final createdAt = now ?? DateTime.now().toUtc(); clearExpired(now: createdAt); _items.removeWhere((item) => item.emailId == emailId && item.operation.index ~/ 2 == operation.index ~/ 2); final mutation = OfflineMutation(id: '${createdAt.microsecondsSinceEpoch}-$emailId', operation: operation, emailId: emailId, expectedVersion: expectedVersion, expiresAt: createdAt.add(ttl)); if (_items.length >= maxItems) _items.removeAt(0); _items.add(mutation); unawaited(persist()); return mutation; }
  void acknowledge(String id) { _items.removeWhere((item) => item.id == id); unawaited(persist()); }
  void clearExpired({DateTime? now}) { _items.removeWhere((item) => item.expiresAt.isBefore(now ?? DateTime.now().toUtc())); unawaited(persist()); }
  Future<void> clear() async { _items.clear(); await storage.delete(key: _key); }
}
