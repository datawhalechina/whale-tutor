<script setup lang="ts">
import { ref } from 'vue';
import type { User } from '@whale-tutor/tutor-types';
import { http } from '@/api/http';

const users = ref<User[]>([]);
const loading = ref(false);

async function loadUsers() {
  loading.value = true;
  try {
    const { data } = await http.get<User[]>('/users');
    users.value = data;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-container style="padding: 24px">
    <el-header>
      <h1>Whale Tutor</h1>
    </el-header>
    <el-main>
      <el-button type="primary" :loading="loading" @click="loadUsers">
        加载用户列表
      </el-button>
      <el-table :data="users" style="margin-top: 16px">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="email" label="Email" />
        <el-table-column prop="name" label="名字" />
      </el-table>
    </el-main>
  </el-container>
</template>
