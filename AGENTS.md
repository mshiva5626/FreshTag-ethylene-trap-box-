# Workspace Guidelines — Smart FreshGuard

This workspace incorporates the **Antigravity Design Expert** skill and guidelines.

## Active Customizations
- **Skill**: [`antigravity-design-expert`](.agents/skills/antigravity-design-expert/SKILL.md)
  - Purpose: UI/UX engineering for highly interactive, spatial, weightless, and glassmorphism-based web interfaces using GSAP, 3D CSS, and smooth micro-animations.

## Core UI/UX Design Principles
1. **Weightlessness & Elevation**: Soft, layered drop shadows (`box-shadow: 0 20px 40px rgba(0,0,0,0.25)`), hovering element interactions, and floating glass cards.
2. **Spatial Depth & 3D Transforms**: Use CSS `perspective`, `rotateX`, and `rotateY` for spatial realism (such as the 3D cutaway chamber door swing).
3. **Glassmorphism**: Backdrop blur filters (`backdrop-filter: blur(16px)`), translucent dark/emerald surfaces, and subtle luminous borders.
4. **Never Snap Instantly**: Every state transition must be smoothed with cubic-bezier transitions (`0.3s ease-out` minimum).
5. **Accessibility**: Respect `prefers-reduced-motion` and optimize GPU rendering using `will-change: transform`.
