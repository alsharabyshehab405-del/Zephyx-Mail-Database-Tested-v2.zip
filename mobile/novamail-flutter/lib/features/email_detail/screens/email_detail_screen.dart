import 'package:flutter/material.dart';

class EmailDetailScreen extends StatelessWidget {
  final String emailId;

  const EmailDetailScreen({super.key, required this.emailId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        actions: [
          IconButton(
            icon: const Icon(Icons.star_border_outlined),
            onPressed: () {},
          ),
          IconButton(icon: const Icon(Icons.reply_outlined), onPressed: () {}),
          IconButton(icon: const Icon(Icons.delete_outline), onPressed: () {}),
        ],
      ),
      body: const Center(child: CircularProgressIndicator()),
    );
  }
}
