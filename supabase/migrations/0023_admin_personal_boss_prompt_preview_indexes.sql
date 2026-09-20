create index if not exists chat_messages_thread_created_id_idx
  on public.chat_messages(thread_id, created_at desc, id desc);

create index if not exists chat_messages_latest_chat_user_idx
  on public.chat_messages(thread_id, created_at desc, id desc)
  where role = 'user' and kind = 'CHAT';
