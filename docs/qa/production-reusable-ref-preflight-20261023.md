# PRE-FLIGHT: ссылка reusable workflow

База72926aeaf0103ff8e6cd41d373ba1e5d040df9d5, веткаfix/production-reusable-ref-20261023.
Dispatch HTTP422: uses требует @main; checkout и caller проверяются как refs/heads/main.
Только две uses-ссылки и регрессия; защищённый main, данные, runtime, приложение и артефакты сохраняются.
Проверки: адресные тесты, независимый security review, обязательный CI.
