alter table public.chat_messages
  add column if not exists position bigint;

-- PostgreSQL now() is stable for a transaction, so simulation seed messages
-- can share created_at. Recover their semantic order before making position
-- the canonical ordering key for all active chat reads.
with ranked as (
  select id,
    row_number() over (
      partition by thread_id
      order by created_at,
        case kind
          when 'SIMULATION_SOURCE' then 0
          when 'SIMULATION_REPLY' then 1
          when 'SIMULATION_REACTION' then 2
          when 'ACTUAL_RESPONSE' then 2
          else 3
        end,
        id
    ) - 1 as position
  from public.chat_messages
)
update public.chat_messages messages
set position = ranked.position
from ranked
where messages.id = ranked.id
  and messages.position is null;

alter table public.chat_messages
  alter column position set not null;

create unique index if not exists chat_messages_thread_position_unique
  on public.chat_messages(thread_id, position);

create index if not exists chat_messages_latest_chat_user_position_idx
  on public.chat_messages(thread_id, position desc)
  where role = 'user' and kind = 'CHAT';
