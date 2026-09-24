# Controle EPI 2.0

Versão conectada ao Supabase usando as tabelas `profiles`, `funcionarios`, `epis`, `entregas` e `entrega_itens`.

## Vercel
Crie estas variáveis em Project Settings > Environment Variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Depois faça um novo deploy.

## Supabase
O banco deve conter as tabelas criadas pelo SQL fornecido no projeto.

## Login
Crie o usuário em Authentication > Users e garanta que exista uma linha correspondente em `profiles`. Para administrador, `role` deve ser `admin`. Outros usuários podem usar `encarregado`.

A impressão usa a própria função de impressão do navegador; escolha "Salvar como PDF".
