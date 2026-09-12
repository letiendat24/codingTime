'use client';

import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { requestJson, storeAccessToken } from '../../lib/api';

interface AuthResponse {
  readonly accessToken: string;
  readonly user: {
    readonly email: string;
    readonly displayName: string;
  };
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: async () => {
      const body = await requestJson<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      storeAccessToken(body.accessToken);

      return body;
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <form className="w-full max-w-sm space-y-4" onSubmit={onSubmit}>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Login</h1>
          <p className="mt-2 text-sm text-muted-foreground">CodeSync auth verification</p>
        </div>
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          type="email"
          value={email}
          placeholder="Email"
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          type="password"
          value={password}
          placeholder="Password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit">
          Login
        </button>
        {login.isSuccess ? (
          <p className="text-sm text-muted-foreground">Logged in as {login.data.user.email}</p>
        ) : null}
        {login.isError ? <p className="text-sm text-red-600">Login failed</p> : null}
      </form>
    </main>
  );
}
