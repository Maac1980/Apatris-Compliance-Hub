import { Router, Request, Response } from 'express'
import { scoreWorkerRisk, scoreAllWorkers } from '../lib/complianceAI.js'
import { logger } from '../lib/logger.js'
import { requireAuth, requireRole } from '../lib/auth-middleware.js'

const router = Router()

router.post('/ai/risk/batch', requireAuth, requireRole('Admin', 'Executive'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { workers } = req.body
    if (!Array.isArray(workers) || workers.length === 0) {
      res.status(400).json({ error: 'workers array is required' })
      return
    }
    if (workers.length > 100) {
      res.status(400).json({ error: 'Maximum 100 workers per batch' })
      return
    }
    const result = await scoreAllWorkers(workers)
    res.json(result)
  } catch (err) {
    logger.error({ err }, 'Failed to score workers')
    res.status(500).json({ error: 'Failed to calculate risk scores' })
  }
})

router.post('/ai/risk/summary', requireAuth, requireRole('Admin', 'Executive'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { workers } = req.body
    if (!Array.isArray(workers)) {
      res.status(400).json({ error: 'workers array is required' })
      return
    }
    const result = await scoreAllWorkers(workers)
    res.json({ summary: result.summary, topRisks: result.workers.slice(0, 10), analysedAt: new Date().toISOString() })
  } catch (err) {
    logger.error({ err }, 'Failed to generate risk summary')
    res.status(500).json({ error: 'Failed to generate risk summary' })
  }
})

router.get('/ai/risk/:workerId', requireAuth, requireRole('Admin', 'Executive'), async (req: Request, res: Response): Promise<void> => {
  try {
    const worker = { id: req.params.workerId, ...req.query }
    const result = await scoreWorkerRisk(worker)
    res.json(result)
  } catch (err) {
    logger.error({ err }, 'Failed to score worker')
    res.status(500).json({ error: 'Failed to calculate risk score' })
  }
})

export default router
