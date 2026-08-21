import { NextRequest, NextResponse } from 'next/server';
import * as clip from '@/app/api/_handlers/clip';
import * as clipFocus from '@/app/api/_handlers/clip-focus';
import * as clipPublish from '@/app/api/_handlers/clip-publish';
import * as clipRender from '@/app/api/_handlers/clip-render';
import * as integrationAccount from '@/app/api/_handlers/integration-account';
import * as integrationCallback from '@/app/api/_handlers/integration-callback';
import * as integrationConnect from '@/app/api/_handlers/integration-connect';
import * as integrations from '@/app/api/_handlers/integrations';
import * as media from '@/app/api/_handlers/media';
import * as project from '@/app/api/_handlers/project';
import * as projectAnalyse from '@/app/api/_handlers/project-analyse';
import * as projectMusic from '@/app/api/_handlers/project-music';
import * as projectRenderBatch from '@/app/api/_handlers/project-render-batch';
import * as projectSource from '@/app/api/_handlers/project-source';
import * as projects from '@/app/api/_handlers/projects';
import * as settings from '@/app/api/_handlers/settings';
import * as uploads from '@/app/api/_handlers/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type CatchAllContext = { params: Promise<{ path: string[] }> };
type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type RoutedHandler = () => Response | Promise<Response>;

function withParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function runMethod(request: NextRequest, handlers: Partial<Record<ApiMethod, RoutedHandler>>) {
  const handler = handlers[request.method as ApiMethod];
  if (handler) return handler();
  const allowed = Object.keys(handlers);
  return NextResponse.json(
    { error: 'Method not allowed.' },
    { status: 405, headers: allowed.length ? { Allow: allowed.join(', ') } : undefined },
  );
}

async function dispatch(request: NextRequest, context: CatchAllContext) {
  const { path } = await context.params;

  if (path.length === 1 && path[0] === 'settings') {
    return runMethod(request, { GET: () => settings.GET() });
  }

  if (path[0] === 'uploads') {
    if (path.length === 1) {
      return runMethod(request, { GET: () => uploads.GET() });
    }
    if (path.length === 2 && path[1] === 'token') {
      return runMethod(request, { POST: () => uploads.POST(request) });
    }
  }

  if (path[0] === 'integrations') {
    if (path.length === 1) {
      return runMethod(request, { GET: () => integrations.GET() });
    }
    const providerContext = withParams({ provider: path[1] });
    if (path.length === 2) {
      return runMethod(request, {
        PATCH: () => integrationAccount.PATCH(request, providerContext),
        DELETE: () => integrationAccount.DELETE(request, providerContext),
      });
    }
    if (path.length === 3 && path[2] === 'connect') {
      return runMethod(request, { GET: () => integrationConnect.GET(request, providerContext) });
    }
    if (path.length === 3 && path[2] === 'callback') {
      return runMethod(request, { GET: () => integrationCallback.GET(request, providerContext) });
    }
  }

  if (path.length === 3 && path[0] === 'media') {
    return runMethod(request, {
      GET: () => media.GET(request, withParams({ projectId: path[1], filename: path[2] })),
    });
  }

  if (path[0] === 'projects') {
    if (path.length === 1) {
      return runMethod(request, {
        GET: () => projects.GET(),
        POST: () => projects.POST(request),
      });
    }

    const projectContext = withParams({ id: path[1] });
    if (path.length === 2) {
      return runMethod(request, {
        GET: () => project.GET(request, projectContext),
        PATCH: () => project.PATCH(request, projectContext),
      });
    }
    if (path.length === 3 && path[2] === 'analyse') {
      return runMethod(request, { POST: () => projectAnalyse.POST(request, projectContext) });
    }
    if (path.length === 3 && path[2] === 'source') {
      return runMethod(request, { GET: () => projectSource.GET(request, projectContext) });
    }
    if (path.length === 3 && path[2] === 'music') {
      return runMethod(request, { POST: () => projectMusic.POST(request, projectContext) });
    }
    if (path.length === 3 && path[2] === 'render-batch') {
      return runMethod(request, { POST: () => projectRenderBatch.POST(request, projectContext) });
    }
    if (path.length >= 4 && path[2] === 'clips') {
      const clipContext = withParams({ id: path[1], clipId: path[3] });
      if (path.length === 4) {
        return runMethod(request, { PATCH: () => clip.PATCH(request, clipContext) });
      }
      if (path.length === 5 && path[4] === 'focus') {
        return runMethod(request, { POST: () => clipFocus.POST(request, clipContext) });
      }
      if (path.length === 5 && path[4] === 'publish') {
        return runMethod(request, { POST: () => clipPublish.POST(request, clipContext) });
      }
      if (path.length === 5 && path[4] === 'render') {
        return runMethod(request, { POST: () => clipRender.POST(request, clipContext) });
      }
    }
  }

  return NextResponse.json({ error: 'API route not found.' }, { status: 404 });
}

export async function GET(request: NextRequest, context: CatchAllContext) {
  return dispatch(request, context);
}

export async function POST(request: NextRequest, context: CatchAllContext) {
  return dispatch(request, context);
}

export async function PATCH(request: NextRequest, context: CatchAllContext) {
  return dispatch(request, context);
}

export async function DELETE(request: NextRequest, context: CatchAllContext) {
  return dispatch(request, context);
}
