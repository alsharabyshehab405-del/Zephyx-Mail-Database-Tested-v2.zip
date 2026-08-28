import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/app_localizations.dart';
import '../../email/data/email_repository.dart';
import '../../email/providers/email_providers.dart';

enum CommerceView { orders, finance, subscriptions, catchUp }

class CommerceHubScreen extends ConsumerStatefulWidget {
  const CommerceHubScreen({super.key, this.initialView = CommerceView.orders});

  final CommerceView initialView;

  @override
  ConsumerState<CommerceHubScreen> createState() => _CommerceHubScreenState();
}

class _CommerceHubScreenState extends ConsumerState<CommerceHubScreen> {
  late CommerceView _view;
  late Future<Object> _future;
  late Future<StorageQuotaModel> _quotaFuture;

  @override
  void initState() {
    super.initState();
    _view = widget.initialView;
    _future = _load(_view);
    _quotaFuture = ref.read(emailRepositoryProvider).getStorageQuota();
  }

  Future<Object> _load(CommerceView view) {
    final repository = ref.read(emailRepositoryProvider);
    switch (view) {
      case CommerceView.orders:
        return repository.listOrders();
      case CommerceView.finance:
        return repository.listFinanceRecords();
      case CommerceView.subscriptions:
        return repository.listSubscriptions();
      case CommerceView.catchUp:
        return repository.getCatchUp();
    }
  }

  void _select(CommerceView view) {
    setState(() {
      _view = view;
      _future = _load(view);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.text('commerceTitle')),
        actions: [
          IconButton(
            tooltip: l10n.text('commerceOpenInbox'),
            onPressed: () => context.go('/'),
            icon: const Icon(Icons.inbox_outlined),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          setState(() {
            _future = _load(_view);
            _quotaFuture = ref.read(emailRepositoryProvider).getStorageQuota();
          });
          await _future;
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Semantics(
              header: true,
              child: Text(l10n.text('commerceTitle'), style: Theme.of(context).textTheme.headlineSmall),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _tab(CommerceView.orders, l10n.text('commerceOrders')),
                _tab(CommerceView.finance, l10n.text('commerceFinance')),
                _tab(CommerceView.subscriptions, l10n.text('commerceSubscriptions')),
                _tab(CommerceView.catchUp, l10n.text('commerceCatchUp')),
              ],
            ),
            const SizedBox(height: 16),
            FutureBuilder<Object>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return Semantics(
                    liveRegion: true,
                    label: l10n.text('commerceLoading'),
                    child: const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
                  );
                }
                if (snapshot.hasError) {
                  return _errorCard(l10n.text('commerceError'), snapshot.error.toString());
                }
                return _content(snapshot.data, l10n);
              },
            ),
            const SizedBox(height: 16),
            FutureBuilder<StorageQuotaModel>(
              future: _quotaFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) return const SizedBox.shrink();
                if (snapshot.hasError) return const SizedBox.shrink();
                final quota = snapshot.data!;
                final used = _formatBytes(quota.usedBytes);
                final limit = quota.quotaBytes == null ? l10n.text('commerceQuotaNotConfigured') : _formatBytes(quota.quotaBytes!);
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.storage_outlined),
                    title: Text(l10n.text('commerceQuota')),
                    subtitle: Text(quota.state == 'NOT_CONFIGURED' ? l10n.text('commerceQuotaNotConfigured') : l10n.text('commerceUsed', values: {'used': '$used / $limit'})),
                    trailing: Text(quota.state),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _tab(CommerceView view, String label) => ChoiceChip(
        label: Text(label),
        selected: _view == view,
        onSelected: (_) => _select(view),
      );

  Widget _content(Object? value, AppLocalizations l10n) {
    switch (_view) {
      case CommerceView.orders:
        final records = value is List<OrderRecordModel> ? value : const <OrderRecordModel>[];
        if (records.isEmpty) return _empty(l10n.text('commerceEmpty'));
        return Column(children: records.map((record) => Card(child: ListTile(
          leading: const Icon(Icons.local_shipping_outlined),
          title: Text(record.merchant ?? l10n.text('commerceMerchantUnknown')),
          subtitle: Text('${l10n.text('commerceOrderNumber')}: ${record.orderNumber ?? l10n.text('commerceAmountUnknown')}\n${record.total ?? l10n.text('commerceAmountUnknown')} ${record.currency ?? ''} · ${record.deliveryState}', maxLines: 3),
          trailing: Text(record.providerState),
        ))).toList(growable: false));
      case CommerceView.finance:
        final records = value is List<FinanceRecordModel> ? value : const <FinanceRecordModel>[];
        if (records.isEmpty) return _empty(l10n.text('commerceEmpty'));
        return Column(children: records.map((record) => Card(child: ListTile(
          leading: const Icon(Icons.receipt_long_outlined),
          title: Text(record.merchant ?? l10n.text('commerceMerchantUnknown')),
          subtitle: Text('${record.kind}: ${record.amount ?? l10n.text('commerceAmountUnknown')} ${record.currency ?? ''}\n${record.paymentStatus}${record.dueDate == null ? '' : ' · ${l10n.text('commerceDue')} ${record.dueDate}'}', maxLines: 3),
          trailing: Text(record.providerState),
        ))).toList(growable: false));
      case CommerceView.subscriptions:
        final records = value is List<SubscriptionRecordModel> ? value : const <SubscriptionRecordModel>[];
        if (records.isEmpty) return _empty(l10n.text('commerceEmpty'));
        return Column(children: records.map((record) => Card(child: ListTile(
          leading: const Icon(Icons.unsubscribe_outlined),
          title: Text(record.sender),
          subtitle: Text(l10n.text('commerceUnsubscribeNotice')),
          trailing: Text(record.state),
        ))).toList(growable: false));
      case CommerceView.catchUp:
        final catchUp = value is CatchUpModel ? value : const CatchUpModel(total: 0, undoRequiredForPermanentDelete: true);
        return Card(child: ListTile(
          leading: const Icon(Icons.mark_email_unread_outlined),
          title: Text(l10n.text('commerceCatchUp')),
          subtitle: Text(l10n.text('commerceCatchUpDescription', values: {'count': '${catchUp.total}'})),
          trailing: OutlinedButton(onPressed: () => context.go('/'), child: Text(l10n.text('commerceOpenInbox'))),
        ));
    }
  }

  Widget _empty(String text) => Semantics(liveRegion: true, child: Card(child: Padding(padding: const EdgeInsets.all(24), child: Text(text, textAlign: TextAlign.center))));

  Widget _errorCard(String title, String detail) => Semantics(liveRegion: true, child: Card(color: Theme.of(context).colorScheme.errorContainer, child: ListTile(title: Text(title), subtitle: Text(detail, maxLines: 2, overflow: TextOverflow.ellipsis))));

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
