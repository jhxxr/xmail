import {
  parseOutlookImportLines,
  resolveClientIdAndRefreshToken,
} from "./oauth-import"

describe("resolveClientIdAndRefreshToken", () => {
  it("detects UUID as client id in either order", () => {
    const clientId = "6daa9f56-5e67-4cb6-ae52-ef89ef912d36"
    const refresh = "M.C5_BAY.long-refresh-token-value-here-xxxxxxxx"
    expect(resolveClientIdAndRefreshToken(clientId, refresh)).toEqual({
      clientId,
      refreshToken: refresh,
    })
    expect(resolveClientIdAndRefreshToken(refresh, clientId)).toEqual({
      clientId,
      refreshToken: refresh,
    })
  })
})

describe("parseOutlookImportLines — card key format", () => {
  it("parses standard card redemption format", () => {
    const rt =
      "M.C511_SN1.0.U.MsaArtifacts.-CoTaSfAtXMURUZZc6CVB1rvDbnWJSULEheYx9K15Og03MyiZC*ixT10ugxfNU621zuoRmedWIVi2S1tl0mI7JvzFP5*FX27sy!kQuu3IF*!n1vkyaHjlTvCvnZ!q2peTdquYRAQcXko7T35BqARfDAuQt22a9GgNYDjiRHuFvvYWNOVh8KjXwdlhi5xe4uU5vJ40qCUtqfT*s4hgxRCXVMZMvuLOG!OHO0J0nxnKO9pYVH*bilxB86gF5ZJENAqbNgQEU1ogK7fmAxuvGKzWgMp8eASWe2HRl8LbTPGjVoZ6ee6B2O89mrQPx3bOiDAmNKI5z8sjZR4XMOS99WYselCQRDNo3L24q5ZygcMGASIK9VJdoLINvRrvXrgO36A9Mg$$"
    const text = `mvrkri37765x@hotmail.com----ep010660----9e5f94bc-e8a4-4e73-b8be-63364c29d753----${rt}`
    const result = parseOutlookImportLines(text)
    expect(result.errors).toHaveLength(0)
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]).toMatchObject({
      email: "mvrkri37765x@hotmail.com",
      password: "ep010660",
      clientId: "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
    })
    expect(result.accounts[0].refreshToken).toBe(rt)
  })

  it("parses 3-field lines without password", () => {
    const text =
      "a@hotmail.com----6daa9f56-5e67-4cb6-ae52-ef89ef912d36----M.C5_BAY.this-is-a-long-enough-token-value-here-xxxxxx"
    const result = parseOutlookImportLines(text)
    expect(result.errors).toHaveLength(0)
    expect(result.accounts[0].password).toBe("")
    expect(result.accounts[0].clientId).toBe("6daa9f56-5e67-4cb6-ae52-ef89ef912d36")
  })

  it("accepts swapped token order after password", () => {
    const rt = "M.C5_BAY.this-is-a-long-enough-token-value-here-xxxxxxxxxxxx"
    const text = `b@live.com----secret----${rt}----6daa9f56-5e67-4cb6-ae52-ef89ef912d36`
    const result = parseOutlookImportLines(text)
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0].clientId).toBe("6daa9f56-5e67-4cb6-ae52-ef89ef912d36")
    expect(result.accounts[0].refreshToken).toBe(rt)
  })
})
