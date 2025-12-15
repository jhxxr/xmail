/**
 * 验证码提取算法测试用例
 *
 * 测试改进后的算法能否正确：
 * 1. 提取真实的验证码
 * 2. 避免误判邮箱中的数字
 * 3. 避免误判订单号、日期等
 */

import { extractVerificationCode } from './utils'

describe('extractVerificationCode', () => {
  describe('正确提取验证码', () => {
    it('应该提取标准格式的验证码', () => {
      const text = '您的验证码是：123456，有效期10分钟。'
      expect(extractVerificationCode(text, null)).toBe('123456')
    })

    it('应该提取英文格式的验证码', () => {
      const text = 'Your verification code is: 789012'
      expect(extractVerificationCode(text, null)).toBe('789012')
    })

    it('应该提取带字母的验证码', () => {
      const text = '验证码: AB12CD'
      expect(extractVerificationCode(text, null)).toBe('AB12CD')
    })

    it('应该从HTML强调标签中提取', () => {
      const html = '<p>您的验证码是 <strong>567890</strong></p>'
      expect(extractVerificationCode(null, html)).toBe('567890')
    })

    it('应该提取Apple OTP格式', () => {
      const text = '@example.com #123456'
      expect(extractVerificationCode(text, null)).toBe('123456')
    })

    it('应该提取独立行的验证码（有关键词）', () => {
      const text = `
验证码如下：

456789

请勿泄露给他人
`
      expect(extractVerificationCode(text, null)).toBe('456789')
    })
  })

  describe('避免误判邮箱中的数字', () => {
    it('不应该提取邮箱用户名中的数字', () => {
      const text = '请回复邮件到 user123456@example.com'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取邮箱域名中的数字', () => {
      const text = '联系我们：support@company2024.com'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取邮箱前后的数字（无关键词）', () => {
      const text = '发送到 123456 test@example.com 确认'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('有验证码关键词时应该正确提取（不受邮箱干扰）', () => {
      const text = '您的验证码是 789456，请发送到 user123@example.com 验证'
      expect(extractVerificationCode(text, null)).toBe('789456')
    })
  })

  describe('避免误判订单号和追踪号', () => {
    it('不应该提取订单号', () => {
      const text = '订单号：1234567890'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取发票号', () => {
      const text = 'Invoice #456789'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取物流单号', () => {
      const text = '快递单号：SF1234567890'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取交易号', () => {
      const text = 'Transaction ID: 123456789'
      expect(extractVerificationCode(text, null)).toBeNull()
    })
  })

  describe('避免误判日期和时间', () => {
    it('不应该提取日期中的数字', () => {
      const text = '发送时间：2024年12月14日'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取年份', () => {
      const text = '版权所有 © 2024 公司名称'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取时间戳', () => {
      const text = '时间：14:30:45'
      expect(extractVerificationCode(text, null)).toBeNull()
    })
  })

  describe('避免误判其他数字', () => {
    it('不应该提取金额', () => {
      const text = '总价格：$12345'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取数量', () => {
      const text = '共123456件商品'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取用户ID', () => {
      const text = 'User ID: 123456'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取账号', () => {
      const text = '账号：123456789'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取URL中的数字', () => {
      const text = '访问 https://example.com/page/123456 查看详情'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取顺序数字（123456）', () => {
      const text = '测试序列 123456 完成'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取重复数字（111111）', () => {
      const text = '编号 111111 已处理'
      expect(extractVerificationCode(text, null)).toBeNull()
    })
  })

  describe('复杂场景测试', () => {
    it('邮件同时包含邮箱和验证码', () => {
      const text = `
尊敬的用户 user12345@example.com：

您的验证码是：892341

如有疑问，请联系 support@company.com
`
      expect(extractVerificationCode(text, null)).toBe('892341')
    })

    it('邮件同时包含订单号和验证码', () => {
      const text = `
订单号：ORDER-1234567890

您的登录验证码：567123

请在15分钟内完成验证
`
      expect(extractVerificationCode(text, null)).toBe('567123')
    })

    it('邮件包含多个数字但只有一个是验证码', () => {
      const text = `
发送时间：2024-12-14 15:30:00
订单号：123456789
金额：$1234.56

您的验证码：789456

请勿泄露给他人
`
      expect(extractVerificationCode(text, null)).toBe('789456')
    })

    it('无关键词的独立数字不应该被识别', () => {
      const text = `
感谢您的订单

订单详情：

123456

商品已发货
`
      expect(extractVerificationCode(text, null)).toBeNull()
    })
  })

  describe('边界条件', () => {
    it('应该处理空内容', () => {
      expect(extractVerificationCode(null, null)).toBeNull()
      expect(extractVerificationCode('', '')).toBeNull()
    })

    it('不应该提取过短的数字（<4位）', () => {
      const text = '验证码：123'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('不应该提取过长的数字（>8位）', () => {
      const text = '验证码：123456789'
      expect(extractVerificationCode(text, null)).toBeNull()
    })

    it('应该提取4位验证码', () => {
      const text = '验证码：4567'
      expect(extractVerificationCode(text, null)).toBe('4567')
    })

    it('应该提取8位验证码', () => {
      const text = '验证码：12345678'
      expect(extractVerificationCode(text, null)).toBe('12345678')
    })
  })
})
