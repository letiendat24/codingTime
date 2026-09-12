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

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const register = useMutation({
    mutationFn: async () => {
      const body = await requestJson<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, displayName, password }),
      });
      storeAccessToken(body.accessToken);

      return body;
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    register.mutate();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <form className="w-full max-w-sm space-y-4" onSubmit={onSubmit}>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Register</h1>
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
          value={displayName}
          placeholder="Display name"
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          type="password"
          value={password}
          placeholder="Password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit">
          Register
        </button>
        {register.isSuccess ? (
          <p className="text-sm text-muted-foreground">Registered {register.data.user.email}</p>
        ) : null}
        {register.isError ? <p className="text-sm text-red-600">Registration failed</p> : null}
      </form>
    </main>
  );
}
