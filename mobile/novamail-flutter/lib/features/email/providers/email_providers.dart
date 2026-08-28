import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../data/email_repository.dart';

final emailRepositoryProvider = Provider<EmailRepository>(
  (ref) => EmailRepository(ref.read(dioProvider)),
);

class EmailListRequest {
  final String folder;
  final String? search;
  final String? category;
  final bool unreadOnly;
  const EmailListRequest({
    this.folder = 'inbox',
    this.search,
    this.category,
    this.unreadOnly = false,
  });
  @override
  bool operator ==(Object other) =>
      other is EmailListRequest &&
      other.folder == folder &&
      other.search == search &&
      other.category == category &&
      other.unreadOnly == unreadOnly;
  @override
  int get hashCode => Object.hash(folder, search, category, unreadOnly);
}

final emailPageProvider = FutureProvider.family<EmailPage, EmailListRequest>(
  (ref, request) => ref.read(emailRepositoryProvider).list(
        folder: request.folder,
        search: request.search,
        category: request.category,
        unreadOnly: request.unreadOnly,
      ),
);
final emailDetailProvider = FutureProvider.family<EmailModel, String>(
  (ref, id) => ref.read(emailRepositoryProvider).get(id),
);
