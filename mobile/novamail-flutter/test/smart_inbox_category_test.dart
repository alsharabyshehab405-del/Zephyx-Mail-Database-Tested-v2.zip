import 'package:flutter_test/flutter_test.dart';
import 'package:novamail_flutter/features/email/data/email_repository.dart';

void main() {
  test('normalizes canonical and legacy email categories', () {
    expect(normalizeEmailCategory('orders'), 'orders');
    expect(normalizeEmailCategory('promotional'), 'promotions');
    expect(normalizeEmailCategory('updates'), 'primary');
    expect(normalizeEmailCategory('unknown'), 'primary');
    expect(emailCategories, hasLength(12));
  });

  test('parses category counts without changing email ownership fields', () {
    final page = EmailPage.fromJson({
      'emails': [
        {
          'id': 'email-1',
          'subject': 'Order shipped',
          'bodyText': 'Tracking',
          'bodyHtml': '<p>Tracking</p>',
          'from': {'email': 'orders@example.invalid'},
          'folder': 'inbox',
          'category': 'orders',
          'isRead': false,
          'isStarred': false,
          'isDraft': false,
        },
      ],
      'total': 1,
      'unreadCount': 1,
      'categoryCounts': {'orders': 1, 'primary': 0},
    });
    expect(page.emails.single.category, 'orders');
    expect(page.categoryCounts['orders'], 1);
    expect(page.categoryCounts['primary'], 0);
  });
}
