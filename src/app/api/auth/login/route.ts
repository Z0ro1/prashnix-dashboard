import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const normalizedEmail = (email || '').trim().toLowerCase();

    const validEmails = ['sauravahire15@gmail.com', 'sauavahire15@gmail.com'];
    const adminPassword = process.env.ADMIN_PASSWORD || 'saurav@123';

    if (validEmails.includes(normalizedEmail) && password === adminPassword) {
      const response = NextResponse.json({ success: true });
      response.cookies.set('streak_admin_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      return response;
    }

    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
