"""Add story.position column

Revision ID: 84ee3700ca06
Revises: PUT_DOWN_REVISION_HERE
Create Date: 2025-10-22 11:xx:xx.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '84ee3700ca06'
down_revision = 'PUT_DOWN_REVISION_HERE'
branch_labels = None
depends_on = None


def upgrade():
    # Add 'position' column with a server_default so existing rows receive 0 immediately.
    # Then remove the server_default (optional) so future inserts use the application default.
    op.add_column('story', sa.Column('position', sa.Integer(),
                  nullable=False, server_default=sa.text('0')))
    try:
        # remove the server_default to keep schema clean (optional)
        op.alter_column('story', 'position', server_default=None)
    except Exception:
        # some DB/Alembic combos may not allow removing server_default here; ignore if it fails.
        pass


def downgrade():
    op.drop_column('story', 'position')
