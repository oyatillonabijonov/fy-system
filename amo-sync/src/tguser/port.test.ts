import { describe, expect, test } from "bun:test"
import { MtArgumentError, MtPeerNotFoundError, tl } from "@mtcute/bun"
import { mapError, TgError } from "./port"

describe("mapError (real mtcute error classes)", () => {
  test("a number not on Telegram", () => {
    expect(mapError(new MtPeerNotFoundError("Peer with phone number 998901234567 was not found"))).toEqual(new TgError("tg_not_found"))
  })
  test("spam limit and privacy refusals are named", () => {
    expect(mapError(new tl.RpcError(400, "PEER_FLOOD"))).toEqual(new TgError("tg_peer_flood"))
    expect(mapError(new tl.RpcError(403, "USER_PRIVACY_RESTRICTED"))).toEqual(new TgError("tg_privacy"))
    expect(mapError(new tl.RpcError(403, "PRIVACY_PREMIUM_REQUIRED"))).toEqual(new TgError("tg_privacy"))
  })
  test("a saved session Telegram no longer accepts", () => {
    expect(mapError(new tl.RpcError(401, "AUTH_KEY_UNREGISTERED"))).toEqual(new TgError("tg_logged_out"))
    // start() swallows the revoked key and asks for a phone it doesn't have
    expect(mapError(new MtArgumentError("Neither phone nor bot token were provided"))).toEqual(new TgError("tg_logged_out"))
  })
})
