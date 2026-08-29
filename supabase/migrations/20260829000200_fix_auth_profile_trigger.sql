drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure private.handle_new_user();
