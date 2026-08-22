import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class BrandMark extends StatelessWidget {
  final bool compact;
  const BrandMark({super.key, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final iconSize = compact ? 20.0 : 22.0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [colors.primary, AppColors.cyan],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(compact ? 11 : 13),
            boxShadow: [
              BoxShadow(
                color: colors.primary.withValues(alpha: .22),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: SizedBox(
            width: compact ? 38 : 44,
            height: compact ? 38 : 44,
            child: Icon(Icons.mail_outline_rounded,
                color: colors.onPrimary, size: iconSize),
          ),
        ),
        if (!compact) ...[
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              'Zephyx Mail',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
        ],
      ],
    );
  }
}
