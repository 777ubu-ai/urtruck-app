import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher_string.dart';

/// Кликабельная ссылка-контакт в профиле (сайт, WhatsApp) — используется и
/// на своём профиле, и на публичном профиле завода, чтобы обе страницы
/// показывали контакты одинаково.
class ProfileLink extends StatelessWidget {
  const ProfileLink({
    super.key,
    required this.icon,
    required this.text,
    required this.url,
  });

  final IconData icon;
  final String text;
  final String url;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: InkWell(
        onTap: () => launchUrlString(url, mode: LaunchMode.externalApplication),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: const Color(0xFF0B66FF)),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0B66FF),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
