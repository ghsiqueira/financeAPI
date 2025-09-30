const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const GoalShare = require('../models/GoalShare');
const Goal = require('../models/Goal');
const User = require('../models/User');

// POST /api/goals/:goalId/share - Compartilhar meta (criar convite)
router.post('/goals/:goalId/share', auth, async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!['viewer', 'contributor', 'co-owner'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Nível de acesso inválido'
      });
    }

    const goal = await Goal.findById(req.params.goalId);

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Meta não encontrada'
      });
    }

    // Verificar se é dono OU co-owner com permissão
    const isOwner = goal.userId.toString() === req.user._id.toString();
    
    if (!isOwner) {
      const share = await GoalShare.findOne({
        goal: req.params.goalId,
        sharedWith: req.user._id,
        status: 'accepted'
      });

      if (!share || !share.permissions.canInviteOthers) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para compartilhar esta meta'
        });
      }
    }

    const userToShare = await User.findOne({ email: email.toLowerCase() });

    if (!userToShare) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado com este e-mail'
      });
    }

    if (userToShare._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Você não pode compartilhar uma meta consigo mesmo'
      });
    }

    const existingShare = await GoalShare.findOne({
      goal: req.params.goalId,
      sharedWith: userToShare._id
    });

    if (existingShare) {
      return res.status(400).json({
        success: false,
        message: 'Esta meta já foi compartilhada com este usuário'
      });
    }

    const share = new GoalShare({
      goal: req.params.goalId,
      owner: goal.userId,
      sharedWith: userToShare._id,
      role: role,
      status: 'pending'
    });

    await share.save();
    await share.populate('goal owner sharedWith');

    res.json({
      success: true,
      message: 'Convite enviado com sucesso',
      data: share
    });

  } catch (error) {
    console.error('Erro ao compartilhar meta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao compartilhar meta'
    });
  }
});

// GET /api/goals/:goalId/shares - Listar compartilhamentos de uma meta
router.get('/goals/:goalId/shares', auth, async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.goalId);

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Meta não encontrada'
      });
    }

    const isOwner = goal.userId.toString() === req.user._id.toString();
    
    if (!isOwner) {
      const share = await GoalShare.findOne({
        goal: req.params.goalId,
        sharedWith: req.user._id,
        status: 'accepted'
      });

      if (!share || !share.permissions.canInviteOthers) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para ver os compartilhamentos desta meta'
        });
      }
    }

    // FILTRAR: Não retornar o próprio usuário na lista
    const shares = await GoalShare.find({
      goal: req.params.goalId,
      sharedWith: { $ne: req.user._id }
    })
    .populate('sharedWith', 'name email')
    .populate('owner', 'name email')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: shares
    });

  } catch (error) {
    console.error('Erro ao buscar compartilhamentos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar compartilhamentos'
    });
  }
});

// GET /api/goals/:goalId/permissions - Verificar permissões do usuário
router.get('/goals/:goalId/permissions', auth, async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.goalId);

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Meta não encontrada'
      });
    }

    const isOwner = goal.userId.toString() === req.user._id.toString();

    if (isOwner) {
      return res.json({
        success: true,
        data: {
          isOwner: true,
          role: 'owner',
          permissions: {
            canAddAmount: true,
            canEdit: true,
            canDelete: true,
            canInviteOthers: true
          }
        }
      });
    }

    const share = await GoalShare.findOne({
      goal: req.params.goalId,
      sharedWith: req.user._id,
      status: 'accepted'
    });

    if (!share) {
      return res.status(403).json({
        success: false,
        message: 'Sem acesso a esta meta'
      });
    }

    res.json({
      success: true,
      data: {
        isOwner: false,
        role: share.role,
        permissions: share.permissions
      }
    });

  } catch (error) {
    console.error('Erro ao verificar permissões:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar permissões'
    });
  }
});

// GET /api/goal-shares/pending - Buscar convites pendentes
router.get('/goal-shares/pending', auth, async (req, res) => {
  try {
    const shares = await GoalShare.find({
      sharedWith: req.user._id,
      status: 'pending'
    })
    .populate('goal', 'title targetAmount currentAmount endDate')
    .populate('owner', 'name email')
    .populate('sharedWith', 'name email')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: shares
    });
  } catch (error) {
    console.error('Erro ao buscar convites pendentes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar convites'
    });
  }
});

// GET /api/goal-shares/accepted - Buscar metas compartilhadas (aceitas)
router.get('/goal-shares/accepted', auth, async (req, res) => {
  try {
    const shares = await GoalShare.find({
      sharedWith: req.user._id,
      status: 'accepted'
    })
    .populate('goal', 'title targetAmount currentAmount endDate')
    .populate('owner', 'name email')
    .populate('sharedWith', 'name email')
    .sort({ acceptedAt: -1 });

    res.json({
      success: true,
      data: shares
    });
  } catch (error) {
    console.error('Erro ao buscar metas compartilhadas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar metas compartilhadas'
    });
  }
});

// POST /api/goal-shares/:shareId/accept - Aceitar convite
router.post('/goal-shares/:shareId/accept', auth, async (req, res) => {
  try {
    const share = await GoalShare.findOne({
      _id: req.params.shareId,
      sharedWith: req.user._id,
      status: 'pending'
    });

    if (!share) {
      return res.status(404).json({
        success: false,
        message: 'Convite não encontrado'
      });
    }

    share.status = 'accepted';
    share.acceptedAt = new Date();
    await share.save();

    await share.populate('goal owner sharedWith');

    res.json({
      success: true,
      message: 'Convite aceito com sucesso',
      data: share
    });
  } catch (error) {
    console.error('Erro ao aceitar convite:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao aceitar convite'
    });
  }
});

// POST /api/goal-shares/:shareId/reject - Rejeitar convite
router.post('/goal-shares/:shareId/reject', auth, async (req, res) => {
  try {
    const share = await GoalShare.findOne({
      _id: req.params.shareId,
      sharedWith: req.user._id,
      status: 'pending'
    });

    if (!share) {
      return res.status(404).json({
        success: false,
        message: 'Convite não encontrado'
      });
    }

    share.status = 'rejected';
    await share.save();

    res.json({
      success: true,
      message: 'Convite rejeitado'
    });
  } catch (error) {
    console.error('Erro ao rejeitar convite:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao rejeitar convite'
    });
  }
});

// DELETE /api/goal-shares/:shareId - Remover compartilhamento
router.delete('/goal-shares/:shareId', auth, async (req, res) => {
  try {
    const share = await GoalShare.findById(req.params.shareId)
      .populate('goal');

    if (!share) {
      return res.status(404).json({
        success: false,
        message: 'Compartilhamento não encontrado'
      });
    }

    const goal = share.goal;

    // Verificar se é o dono da meta
    const isOwner = goal.userId.toString() === req.user._id.toString();

    // Se não for o dono, verificar se é co-owner com permissão ou se está se removendo
    if (!isOwner) {
      // Verificar se é a própria pessoa se removendo
      const isSelfRemoving = share.sharedWith.toString() === req.user._id.toString();

      if (!isSelfRemoving) {
        // Verificar se é co-owner com permissão
        const userShare = await GoalShare.findOne({
          goal: goal._id,
          sharedWith: req.user._id,
          status: 'accepted'
        });

        if (!userShare || !userShare.permissions.canInviteOthers) {
          return res.status(403).json({
            success: false,
            message: 'Você não tem permissão para remover compartilhamentos'
          });
        }
      }
    }

    await GoalShare.deleteOne({ _id: req.params.shareId });

    res.json({
      success: true,
      message: 'Compartilhamento removido'
    });
  } catch (error) {
    console.error('Erro ao remover compartilhamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover compartilhamento'
    });
  }
});

// PATCH /api/goal-shares/:shareId/role - Atualizar role
router.patch('/goal-shares/:shareId/role', auth, async (req, res) => {
  try {
    const { role } = req.body;

    if (!['viewer', 'contributor', 'co-owner'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role inválido'
      });
    }

    const share = await GoalShare.findById(req.params.shareId)
      .populate('goal');

    if (!share) {
      return res.status(404).json({
        success: false,
        message: 'Compartilhamento não encontrado'
      });
    }

    // VALIDAÇÃO 1: Não pode mudar sua própria permissão
    if (share.sharedWith.toString() === req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Você não pode alterar sua própria permissão'
      });
    }

    // VALIDAÇÃO 2: Verificar se é dono OU co-owner com permissão
    const goal = share.goal;
    const isOwner = goal.userId.toString() === req.user._id.toString();
    
    if (!isOwner) {
      const userShare = await GoalShare.findOne({
        goal: goal._id,
        sharedWith: req.user._id,
        status: 'accepted'
      });

      if (!userShare || !userShare.permissions.canInviteOthers) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para alterar permissões'
        });
      }
    }

    share.role = role;
    await share.save();
    await share.populate('owner sharedWith');

    res.json({
      success: true,
      message: 'Permissão atualizada',
      data: share
    });
  } catch (error) {
    console.error('Erro ao atualizar permissão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar permissão'
    });
  }
});

module.exports = router;