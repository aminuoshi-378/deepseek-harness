#!/usr/bin/env python3
"""
CodeFuse 内网模型 API 测试 demo（Python OpenAI SDK）

覆盖两种接入形态：
  A. 直连内网网关 codexmuse —— 用 OpenAI SDK 的 extra_headers 传 X-AGENT-* 认证头
  B. 走本地适配代理        —— 标准 base_url + api_key（dsh 接入用的同一入口）

凭证从 ~/.codefuse/fuse/codefuse.json 动态读取，不硬编码。
用法: python3 codefuse_api_demo.py
"""
import json
import os
import time

from openai import OpenAI

MODEL = "antchat/DeepSeek-V4-Flash-0731"
UPSTREAM = "https://codexmuse.antgroup-inc.cn/v1"
PROXY = "http://127.0.0.1:8787/v1"

# ---------- 读取 CodeFuse 凭证 ----------
with open(os.path.expanduser("~/.codefuse/fuse/codefuse.json")) as f:
    _cfg = json.load(f)
AGENT_USER = _cfg["workid"]
AGENT_TOKEN = _cfg["token"]


def agent_headers():
    """codexmuse 风控要求的认证头（TASK-ID 每次请求重新生成）

    Accept 固定 */*: 上游网关拒绝 OpenAI SDK 默认的 application/json
    （报 No acceptable representation），curl 默认的 */* 可通过。
    """
    return {
        "Accept": "*/*",
        "X-AGENT-USER": AGENT_USER,
        "X-AGENT-TOKEN": AGENT_TOKEN,
        "X-AGENT-PRODUCT-SOURCE": "codefuse",
        "X-AGENT-TASK-ID": f"task-{int(time.time() * 1000)}",
    }


def run(name, client, stream, direct=False):
    t0 = time.time()
    msgs = [{"role": "user", "content": "用一句话说明什么是 OpenAI Chat Completions 协议"}]
    mode = "流式" if stream else "非流式"
    try:
        kwargs = dict(model=MODEL, messages=msgs, max_tokens=100, stream=stream)
        if direct:
            kwargs["extra_headers"] = agent_headers()
        resp = client.chat.completions.create(**kwargs)
        if stream:
            parts = []
            for chunk in resp:
                if chunk.choices and chunk.choices[0].delta.content:
                    parts.append(chunk.choices[0].delta.content)
            text = "".join(parts)
            print(f"[{name}] {mode} OK {time.time() - t0:.1f}s {len(text)}字")
            print(f"  回复: {text[:80]}{'...' if len(text) > 80 else ''}")
        else:
            text = resp.choices[0].message.content
            print(f"[{name}] {mode} OK {time.time() - t0:.1f}s {len(text)}字")
            print(f"  回复: {text[:80]}{'...' if len(text) > 80 else ''}")
            print(f"  usage: prompt={resp.usage.prompt_tokens} "
                  f"completion={resp.usage.completion_tokens} "
                  f"finish={resp.choices[0].finish_reason} model={resp.model}")
            return
    except Exception as e:
        print(f"[{name}] {mode} 失败: {type(e).__name__}: {str(e)[:200]}")


def direct_nonstream(client):
    """直连形态的非流式：上游即使 stream=false 也返回 'data:{...}' SSE 帧(偶发多帧)，
    OpenAI SDK 无法解析，需 raw response + 手动重组 —— 本地适配代理已内置此逻辑。"""
    t0 = time.time()
    msgs = [{"role": "user", "content": "用一句话说明什么是 OpenAI Chat Completions 协议"}]
    r = client.chat.completions.with_raw_response.create(
        model=MODEL, messages=msgs, max_tokens=100, extra_headers=agent_headers())
    frames = [ln[5:].strip() for ln in r.text.splitlines() if ln.startswith("data:")]
    objs = [json.loads(f) for f in frames if f]
    if len(objs) == 1:
        obj = objs[0]
        text = obj["choices"][0]["message"]["content"]
    else:  # 多帧 chunk: 合并 delta
        text = "".join(o["choices"][0]["delta"].get("content", "") or ""
                       for o in objs if o.get("choices"))
    usage = objs[-1].get("usage")
    print(f"[A 直连上游] 非流式(手动重组) OK {time.time() - t0:.1f}s {len(text)}字")
    print(f"  回复: {text[:80]}{'...' if len(text) > 80 else ''}")
    print(f"  usage: {usage}")


def main():
    direct = OpenAI(api_key="unused", base_url=UPSTREAM)  # 认证走 extra_headers
    proxy = OpenAI(api_key="local-proxy", base_url=PROXY)  # api_key 任意值，代理注入真实凭证

    print(f"模型: {MODEL}\n")
    direct_nonstream(direct)
    run("A 直连上游", direct, stream=True, direct=True)
    print()
    run("B 本地代理", proxy, stream=False)
    run("B 本地代理", proxy, stream=True)


if __name__ == "__main__":
    main()